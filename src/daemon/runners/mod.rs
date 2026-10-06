//! What the sidebar command bar can run in a folder: package scripts, just
//! recipes, and Makefile targets (ADR 0029). Unrelated to the Factory runner
//! in `daemon::runner`.
//!
//! Everything here is blocking file IO plus, for justfiles, one `just`
//! subprocess; call it from `spawn_blocking`.

mod just;
mod make;
mod npm;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use warpforge_protocol::RunCommands;

/// A changed file rebuilds at once; this only bounds how long a `just` that
/// was installed or removed meanwhile goes unnoticed.
const TTL: Duration = Duration::from_secs(60);

const WATCHED: &[&str] = &[
    "package.json",
    "bun.lock",
    "bun.lockb",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "Makefile",
    "makefile",
    "GNUmakefile",
];

type Fingerprint = Vec<(PathBuf, Option<SystemTime>)>;

struct Cached {
    at: Instant,
    fingerprint: Fingerprint,
    found: RunCommands,
}

static CACHE: Mutex<Option<HashMap<PathBuf, Cached>>> = Mutex::new(None);

/// The commands declared in `dir`. A justfile is also looked for in the
/// folders above it, up to `repo_root`, the way `just` finds one.
pub fn detect(dir: &Path, repo_root: &Path) -> RunCommands {
    let justfile = just::find(dir, repo_root);
    let fingerprint = fingerprint(dir, justfile.as_deref());
    {
        let guard = CACHE.lock().unwrap();
        if let Some(hit) = guard.as_ref().and_then(|map| map.get(dir)) {
            if hit.at.elapsed() < TTL && hit.fingerprint == fingerprint {
                return hit.found.clone();
            }
        }
    }
    let found = detect_uncached(dir, justfile.as_deref(), &just::binary());
    CACHE
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(
            dir.to_path_buf(),
            Cached {
                at: Instant::now(),
                fingerprint,
                found: found.clone(),
            },
        );
    found
}

pub(crate) fn detect_uncached(dir: &Path, justfile: Option<&Path>, just_bin: &str) -> RunCommands {
    let mut out = RunCommands::default();
    if let Some(file) = justfile {
        just::read(file, just_bin, &mut out);
    }
    npm::read(dir, &mut out);
    make::read(dir, &mut out);
    out
}

fn fingerprint(dir: &Path, justfile: Option<&Path>) -> Fingerprint {
    WATCHED
        .iter()
        .map(|name| dir.join(name))
        .chain(justfile.map(Path::to_path_buf))
        .chain(justfile.and_then(Path::parent).map(Path::to_path_buf))
        .map(|path| {
            let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
            (path, modified)
        })
        .collect()
}

/// Words that name something meant to keep running, matched against the
/// name's parts (`dev`, `web-dev`, `start:api`).
const LONG_NAMES: &[&str] = &[
    "dev",
    "serve",
    "server",
    "start",
    "watch",
    "preview",
    "storybook",
    "tail",
];
/// Whole names only: `run` alone usually starts the app, `run-tests` does not.
const LONG_WHOLE: &[&str] = &["run", "up"];
/// Commands in a body that stay in the foreground.
const LONG_BODY: &[&str] = &[
    "--watch",
    " -w ",
    "vite",
    "next dev",
    "nodemon",
    "cargo watch",
    "cargo run",
    "tauri dev",
    "docker compose up",
    "docker-compose up",
    "tail -f",
    "http.server",
    "uvicorn",
    "flask run",
    "rails s",
    "webpack serve",
    "storybook",
];

/// Likely to keep running, so the command bar opens it in a terminal instead
/// of waiting on it. The user can flip this per run.
pub(crate) fn long_running(name: &str, body: &str) -> bool {
    let name = name
        .rsplit("::")
        .next()
        .unwrap_or(name)
        .to_ascii_lowercase();
    if LONG_WHOLE.contains(&name.as_str()) {
        return true;
    }
    if name
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|part| LONG_NAMES.contains(&part))
    {
        return true;
    }
    let body = format!(" {} ", body.to_ascii_lowercase());
    if body.contains(" -d ") || body.contains("--detach") {
        return false;
    }
    LONG_BODY.iter().any(|marker| body.contains(marker))
}
