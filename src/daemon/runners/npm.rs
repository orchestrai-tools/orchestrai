//! `package.json` scripts, run with the package manager the lockfile names.

use std::path::Path;

use warpforge_protocol::{RunCommand, RunCommands, RunSource, RunSourceNote};

/// npm runs these itself around install and publish; nobody runs them by hand.
const LIFECYCLE: &[&str] = &[
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "prepublish",
    "prepublishOnly",
    "prepack",
    "postpack",
    "preuninstall",
    "postuninstall",
];

/// How to run a script: the `packageManager` field wins, then the lockfile.
pub(crate) fn runner(dir: &Path, package_manager: Option<&str>) -> &'static str {
    let named = package_manager
        .and_then(|value| value.split('@').next())
        .unwrap_or_default();
    match named {
        "bun" => return "bun run",
        "pnpm" => return "pnpm run",
        "yarn" => return "yarn",
        "npm" => return "npm run",
        _ => {}
    }
    if dir.join("bun.lock").is_file() || dir.join("bun.lockb").is_file() {
        "bun run"
    } else if dir.join("pnpm-lock.yaml").is_file() {
        "pnpm run"
    } else if dir.join("yarn.lock").is_file() {
        "yarn"
    } else {
        "npm run"
    }
}

pub(super) fn read(dir: &Path, out: &mut RunCommands) {
    let path = dir.join("package.json");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    let pkg: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            out.errors.push(RunSourceNote {
                source: RunSource::Npm,
                message: format!("package.json does not parse: {error}"),
            });
            return;
        }
    };
    let Some(scripts) = pkg.get("scripts").and_then(|s| s.as_object()) else {
        return;
    };
    let run = runner(dir, pkg.get("packageManager").and_then(|v| v.as_str()));
    let mut named: Vec<(&String, &str)> = scripts
        .iter()
        .filter(|(name, _)| !LIFECYCLE.contains(&name.as_str()))
        .filter_map(|(name, body)| body.as_str().map(|body| (name, body)))
        .collect();
    // The map is sorted by key; the file's own order is what people expect.
    let from = raw.find("\"scripts\"").unwrap_or(0);
    named.sort_by_key(|(name, _)| {
        raw[from..]
            .find(&format!("\"{name}\""))
            .unwrap_or(usize::MAX)
    });
    out.commands
        .extend(named.into_iter().map(|(name, body)| RunCommand {
            id: format!("npm:{name}"),
            source: RunSource::Npm,
            name: name.clone(),
            command: format!("{run} {name}"),
            description: Some(body.to_string()),
            group: None,
            params: Vec::new(),
            confirm: None,
            aliases: Vec::new(),
            long_running: super::long_running(name, body),
            is_default: false,
            exact: true,
        }));
}
