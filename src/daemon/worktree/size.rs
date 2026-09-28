//! Disk usage of a worktree. Walking a checkout with a build directory is slow,
//! so it runs on the blocking pool, gives up at a deadline, and is cached.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use walkdir::WalkDir;

const CACHE_TTL: Duration = Duration::from_secs(60);
const LIST_BUDGET: Duration = Duration::from_secs(15);

type Cache = Mutex<HashMap<PathBuf, (Instant, u64)>>;

fn cache() -> &'static Cache {
    static CACHE: OnceLock<Cache> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Bytes a worktree occupies, from cache when measured within the last minute.
///
/// @param path The worktree directory.
/// @returns The size, or `None` when measuring did not finish in time.
pub async fn cached_size(path: &Path) -> Option<u64> {
    if let Some((at, size)) = cache().lock().unwrap().get(path) {
        if at.elapsed() < CACHE_TTL {
            return Some(*size);
        }
    }
    let owned = path.to_owned();
    let size = tokio::task::spawn_blocking(move || disk_usage(&owned, LIST_BUDGET))
        .await
        .ok()
        .flatten()?;
    cache()
        .lock()
        .unwrap()
        .insert(path.to_owned(), (Instant::now(), size));
    Some(size)
}

/// Drop a cached size after the directory changed.
///
/// @param path The worktree directory.
pub fn forget_size(path: &Path) {
    cache().lock().unwrap().remove(path);
}

/// Bytes allocated under `path`, without following symlinks.
///
/// @param path The directory to measure.
/// @param budget How long the walk may take before giving up.
/// @returns The total, or `None` when the budget ran out.
pub(super) fn disk_usage(path: &Path, budget: Duration) -> Option<u64> {
    let deadline = Instant::now() + budget;
    let mut total = 0;
    for entry in WalkDir::new(path).follow_links(false) {
        if Instant::now() > deadline {
            return None;
        }
        if let Ok(meta) = entry.and_then(|e| e.metadata()) {
            total += allocated(&meta);
        }
    }
    Some(total)
}

#[cfg(unix)]
fn allocated(meta: &std::fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.blocks() * 512
}

#[cfg(not(unix))]
fn allocated(meta: &std::fs::Metadata) -> u64 {
    meta.len()
}
