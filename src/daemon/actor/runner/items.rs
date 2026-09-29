//! Reading and writing the backlog items the runner works on, in whichever
//! backend holds them. Always the root checkout's backlog, never a worktree's
//! copy (ADR 0023 invariant 11).

use anyhow::{anyhow, Result};

use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;

impl Daemon {
    /// The backlog item `item_id` of `project`, as stored now.
    pub(super) fn runner_read_item(
        &self,
        project: &str,
        item_id: &str,
    ) -> Result<Option<wire::BacklogItem>> {
        let path = self
            .project_path(project)
            .ok_or_else(|| anyhow!("unknown project '{project}'"))?;
        let store = self
            .store
            .as_ref()
            .ok_or_else(|| anyhow!("daemon has no persistent store"))?;
        let store = store.lock().unwrap_or_else(|e| e.into_inner());
        if store.backlog_storage_mode()? == wire::BacklogStorageMode::Yaml {
            return crate::daemon::backlog::read(&path, project, item_id);
        }
        Ok(store
            .get_backlog_item(item_id)?
            .filter(|item| item.project == project))
    }

    /// Set an item's user-facing status, and its task link when given.
    pub(super) fn runner_write_item(
        &self,
        project: &str,
        item_id: &str,
        status: &str,
        task_id: Option<&str>,
    ) {
        let result = self.runner_read_item(project, item_id).and_then(|item| {
            let Some(mut item) = item else {
                return Ok(());
            };
            item.status = status.to_string();
            if let Some(task_id) = task_id {
                item.task_id = Some(task_id.to_string());
            }
            item.updated_at = crate::daemon::task::now_secs();
            let path = self
                .project_path(project)
                .ok_or_else(|| anyhow!("unknown project '{project}'"))?;
            let store = self
                .store
                .as_ref()
                .ok_or_else(|| anyhow!("daemon has no persistent store"))?;
            let store = store.lock().unwrap_or_else(|e| e.into_inner());
            if store.backlog_storage_mode()? == wire::BacklogStorageMode::Yaml {
                crate::daemon::backlog::write(&path, &item)
            } else {
                store.upsert_backlog_item(&item)
            }
        });
        if let Err(error) = result {
            eprintln!("[runner] could not set backlog item {item_id} to {status}: {error:#}");
        }
    }
}
