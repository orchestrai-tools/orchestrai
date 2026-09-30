//! Queue edits and settings: removing and reordering queued Factory tasks,
//! and the project's limits and defaults. Each writes the mirror, queues the
//! store write and pushes the project's status.

use warpforge_protocol as wire;

use super::now_secs;
use crate::daemon::actor::Daemon;
use crate::daemon::runtime::Write as PersistWrite;

impl Daemon {
    pub(super) fn runner_dequeue(&mut self, project: &str, task_id: &str) -> Result<(), String> {
        let entry = self
            .runner
            .entries
            .get(task_id)
            .filter(|e| e.project == project)
            .ok_or_else(|| "that task is not in the Factory".to_string())?;
        let preparing = self
            .runner
            .leases
            .get(project)
            .is_some_and(|l| l.task_id == task_id);
        if entry.state != wire::RunnerEntryState::Queued || preparing {
            return Err("that task has already started; stop it from its task instead".to_string());
        }
        self.runner_discard_queued(task_id);
        self.runner_emit(project);
        Ok(())
    }

    pub(super) fn runner_reorder(
        &mut self,
        project: &str,
        task_ids: &[String],
    ) -> Result<(), String> {
        self.runner_require_project(project)?;
        let queued: Vec<String> =
            crate::daemon::runner::dispatch_order(self.runner.entries.values(), project)
                .into_iter()
                .map(|e| e.task_id.clone())
                .collect();
        let ordered = task_ids
            .iter()
            .filter(|id| queued.contains(id))
            .chain(queued.iter().filter(|id| !task_ids.contains(id)));
        for (position, id) in ordered.enumerate() {
            if let Some(mut entry) = self.runner.entries.get(id).cloned() {
                if entry.position != position as u64 {
                    entry.position = position as u64;
                    self.runner_put_entry(entry);
                }
            }
        }
        self.runner_emit(project);
        Ok(())
    }

    pub(super) fn runner_update_settings(
        &mut self,
        project: &str,
        patch: wire::RunnerSettingsPatch,
    ) -> Result<(), String> {
        let path = self
            .project_path(project)
            .ok_or_else(|| format!("unknown project '{project}'"))?;
        let mut settings = self.runner_settings(project);
        let wire::RunnerSettingsPatch {
            workflow,
            agent,
            model,
            max_concurrent,
            max_open_prs,
            max_per_day,
            headroom_pct,
            min_free_gb,
            run_location,
        } = patch;
        if let Some(workflow) = workflow {
            let workflow = workflow.trim().to_string();
            let loaded =
                crate::workflow_config::load_workflow(std::path::Path::new(&path), &workflow)
                    .ok_or_else(|| format!("unknown workflow `{workflow}`"))?;
            loaded
                .spec
                .map_err(|e| format!("workflow `{workflow}` is invalid: {e}"))?;
            settings.workflow = workflow;
        }
        if let Some(agent) = agent {
            settings.agent = agent.trim().to_string();
        }
        if let Some(model) = model {
            settings.model = Some(model.trim().to_string()).filter(|m| !m.is_empty());
        }
        let bounded = |value: Option<u32>, current: u32, min: u32, max: u32, name: &str| match value
        {
            Some(v) if !(min..=max).contains(&v) => {
                Err(format!("{name} must be between {min} and {max}"))
            }
            Some(v) => Ok(v),
            None => Ok(current),
        };
        settings.max_concurrent = bounded(
            max_concurrent,
            settings.max_concurrent,
            1,
            8,
            "tasks at the same time",
        )?;
        settings.max_open_prs = bounded(
            max_open_prs,
            settings.max_open_prs,
            1,
            50,
            "open draft pull requests",
        )?;
        settings.max_per_day = bounded(
            max_per_day,
            settings.max_per_day,
            1,
            200,
            "new tasks per 24 hours",
        )?;
        settings.headroom_pct =
            bounded(headroom_pct, settings.headroom_pct, 1, 100, "quota limit")?;
        settings.min_free_gb = bounded(min_free_gb, settings.min_free_gb, 0, 10_000, "free disk")?;
        if let Some(run_location) = run_location {
            settings.run_location = run_location;
        }
        settings.updated_at = now_secs();
        self.persist
            .write(PersistWrite::RunnerSettings(Box::new(settings.clone())));
        self.runner.settings.insert(project.to_string(), settings);
        self.runner_emit(project);
        Ok(())
    }
}
