//! Adopting the worktrees persisted tasks recorded, at daemon start.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::daemon::store::Store;
use crate::daemon::task::Task;
use crate::daemon::worktree::WorktreeManager;
use crate::registry::ProjectEntry;

/// Rebuild per-project worktree managers from persisted tasks at boot, clearing
/// `task.worktree` only when git confirms the checkout is gone (ADR 0015).
pub(super) fn restore_worktrees(
    projects: &[ProjectEntry],
    tasks: &mut HashMap<String, Task>,
    store: Option<&Store>,
) -> HashMap<String, WorktreeManager> {
    let mut managers = HashMap::new();
    for project in projects {
        let recorded: Vec<(String, String, Option<String>)> = tasks
            .values()
            .filter(|t| t.project == project.name)
            .filter_map(|t| {
                t.worktree
                    .clone()
                    .map(|path| (t.id.clone(), path, t.base_branch.clone()))
            })
            .collect();
        if recorded.is_empty() {
            continue;
        }
        let repo = PathBuf::from(&project.path);
        // A failed `git worktree list` must not be read as "no worktrees":
        // adopt and clear nothing rather than wipe records on a transient miss.
        let Some(porcelain) = git_worktree_list(&repo) else {
            eprintln!(
                "[daemon] git worktree list failed for project {}; keeping persisted worktrees",
                project.name
            );
            continue;
        };
        let mut mgr = WorktreeManager::new(repo);
        let missing = mgr.restore(&recorded, Some(&porcelain));
        for id in &missing {
            if let Some(task) = tasks.get_mut(id) {
                task.worktree = None;
                if let Some(store) = store {
                    let _ = store.upsert_task(task);
                }
            }
        }
        managers.insert(project.name.clone(), mgr);
    }
    managers
}

/// `git worktree list --porcelain` at boot; `None` on any failure so the caller
/// can keep the persisted records instead of clearing them.
fn git_worktree_list(repo: &std::path::Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(dir: &std::path::Path) -> ProjectEntry {
        ProjectEntry {
            name: "demo".into(),
            path: dir.to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }
    }

    /// A transient `git worktree list` failure must not wipe persisted records.
    #[test]
    fn git_failure_keeps_recorded_worktrees() {
        // A directory that is not a git repo: `git worktree list` fails.
        let dir = tempfile::tempdir().unwrap();
        let mut tasks = HashMap::new();
        let mut task = Task::new("demo", "p", "agent", vec![]);
        let path = dir.path().join(".worktrees/t_keep");
        task.worktree = Some(path.to_string_lossy().into_owned());
        let id = task.id.clone();
        tasks.insert(id.clone(), task);

        let managers = restore_worktrees(&[project(dir.path())], &mut tasks, None);

        assert_eq!(
            tasks[&id].worktree.as_deref(),
            Some(path.to_string_lossy().as_ref()),
            "a failed git call must not clear the record"
        );
        assert!(
            !managers.contains_key("demo"),
            "nothing is adopted when git fails"
        );
    }
}
