//! Queue edits and settings: what a person (or an agent they started) asks
//! the runner to do. Each writes the mirror, queues the store write and
//! pushes the project's status.

use warpforge_protocol as wire;

use super::now_secs;
use crate::daemon::actor::Daemon;
use crate::daemon::runner::{next_position, RUNNER_TAG};
use crate::daemon::runtime::Write as PersistWrite;

/// Per-item choices that override the project's settings.
#[derive(Debug, Default)]
pub(super) struct Overrides {
    pub workflow: Option<String>,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub run_location: wire::EntryRunLocation,
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

impl Daemon {
    /// Refuse a queue request from inside a Factory run, so a run can never
    /// fill the queue it is draining (ADR 0023 invariant 2).
    fn runner_refuse_origin(&self, origin_task: Option<&str>) -> Result<(), String> {
        let Some(task_id) = origin_task else {
            return Ok(());
        };
        let mut current = self.tasks.get(task_id);
        while let Some(task) = current {
            if task.tags.iter().any(|t| t == RUNNER_TAG) {
                return Err("a Factory run cannot queue backlog items".to_string());
            }
            current = task
                .parent_task_id
                .as_deref()
                .and_then(|p| self.tasks.get(p));
        }
        Ok(())
    }

    pub(super) fn runner_enqueue(
        &mut self,
        project: &str,
        item_ids: &[String],
        overrides: Overrides,
        origin_task: Option<&str>,
    ) -> Result<(), String> {
        self.runner_require_project(project)?;
        self.runner_refuse_origin(origin_task)?;
        if item_ids.is_empty() {
            return Err("no backlog items given".to_string());
        }
        let now = now_secs();
        let mut refused = Vec::new();
        let mut queued = 0;
        for item_id in item_ids {
            if self.runner.entries.contains_key(item_id) {
                continue;
            }
            let item = match self.runner_read_item(project, item_id) {
                Ok(Some(item)) => item,
                Ok(None) => {
                    refused.push(format!("no backlog item {item_id} in '{project}'"));
                    continue;
                }
                Err(error) => {
                    refused.push(format!("{error:#}"));
                    continue;
                }
            };
            if matches!(item.status.as_str(), "done" | "cancelled") {
                refused.push(format!("#{} is already {}", item.number, item.status));
                continue;
            }
            let entry = wire::RunnerEntry {
                item_id: item.id.clone(),
                project: project.to_string(),
                number: item.number,
                title: item.title.clone(),
                priority: item.priority.clone(),
                position: next_position(self.runner.entries.values(), project),
                enqueued_at: now,
                state: wire::RunnerEntryState::Queued,
                workflow: non_empty(overrides.workflow.clone()),
                agent: non_empty(overrides.agent.clone()),
                model: non_empty(overrides.model.clone()),
                run_location: overrides.run_location,
                resolved_location: None,
                task_id: None,
                run_id: None,
                pr_url: None,
                pr_number: None,
                waiting_reason: None,
                updated_at: now,
            };
            self.runner_put_entry(entry);
            queued += 1;
        }
        if queued > 0 {
            self.runner_emit(project);
        }
        if queued == 0 && !refused.is_empty() {
            return Err(refused.join("; "));
        }
        Ok(())
    }

    pub(super) fn runner_dequeue(&mut self, project: &str, item_id: &str) -> Result<(), String> {
        let entry = self
            .runner
            .entries
            .get(item_id)
            .filter(|e| e.project == project)
            .ok_or_else(|| "that item is not in the Factory queue".to_string())?;
        if entry.state != wire::RunnerEntryState::Queued {
            return Err(
                "that item has already started; stop its pipeline from its task instead"
                    .to_string(),
            );
        }
        self.runner_drop_entry(item_id);
        self.runner_emit(project);
        Ok(())
    }

    pub(super) fn runner_set_location(
        &mut self,
        project: &str,
        item_id: &str,
        run_location: wire::EntryRunLocation,
    ) -> Result<(), String> {
        let mut entry = self
            .runner
            .entries
            .get(item_id)
            .filter(|e| e.project == project)
            .cloned()
            .ok_or_else(|| "that item is not in the Factory queue".to_string())?;
        let preparing = self
            .runner
            .leases
            .get(project)
            .is_some_and(|l| l.item_id == item_id);
        if entry.state != wire::RunnerEntryState::Queued || preparing {
            return Err("that item has already started; its run location is fixed".to_string());
        }
        if entry.run_location != run_location {
            entry.run_location = run_location;
            entry.waiting_reason = None;
            self.runner_put_entry(entry);
            self.runner_emit(project);
        }
        Ok(())
    }

    pub(super) fn runner_reorder(
        &mut self,
        project: &str,
        item_ids: &[String],
    ) -> Result<(), String> {
        self.runner_require_project(project)?;
        let queued: Vec<String> =
            crate::daemon::runner::dispatch_order(self.runner.entries.values(), project)
                .into_iter()
                .map(|e| e.item_id.clone())
                .collect();
        let ordered = item_ids
            .iter()
            .filter(|id| queued.contains(id))
            .chain(queued.iter().filter(|id| !item_ids.contains(id)));
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
            running,
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
            "concurrent runs",
        )?;
        settings.max_open_prs = bounded(
            max_open_prs,
            settings.max_open_prs,
            1,
            50,
            "open pull requests",
        )?;
        settings.max_per_day = bounded(max_per_day, settings.max_per_day, 1, 200, "items per day")?;
        settings.headroom_pct = bounded(headroom_pct, settings.headroom_pct, 1, 100, "headroom")?;
        settings.min_free_gb = bounded(min_free_gb, settings.min_free_gb, 0, 10_000, "free disk")?;
        if let Some(run_location) = run_location {
            settings.run_location = run_location;
        }
        if let Some(running) = running {
            settings.running = running;
        }
        settings.updated_at = now_secs();
        self.persist
            .write(PersistWrite::RunnerSettings(Box::new(settings.clone())));
        self.runner.settings.insert(project.to_string(), settings);
        self.runner_emit(project);
        Ok(())
    }

    /// Stop starting items in `project`; runs in flight go on.
    pub(super) fn runner_pause(&mut self, project: &str) {
        let mut settings = self.runner_settings(project);
        if !settings.running {
            return;
        }
        settings.running = false;
        settings.updated_at = now_secs();
        self.persist
            .write(PersistWrite::RunnerSettings(Box::new(settings.clone())));
        self.runner.settings.insert(project.to_string(), settings);
    }
}
