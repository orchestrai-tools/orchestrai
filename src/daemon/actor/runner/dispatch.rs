//! Starting queued items: the gates in front of each dispatch, then a
//! workflow pipeline in a fresh worktree forked from origin's default branch.

use std::collections::HashMap;

use warpforge_protocol as wire;

use super::now_secs;
use crate::daemon::accounts::SpawnAccount;
use crate::daemon::actor::Daemon;
use crate::daemon::runner::{self as logic, Slots};
use crate::daemon::worktree::StartPoint;

/// Free space on the volume holding `path`, in whole gigabytes.
fn free_gb(path: &str) -> Option<u64> {
    let c_path = std::ffi::CString::new(path).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c_path` is a valid NUL-terminated string and `stat` is a
    // properly sized, writable statvfs.
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } != 0 {
        return None;
    }
    Some((stat.f_bavail as u64).saturating_mul(stat.f_frsize as u64) / 1_000_000_000)
}

impl Daemon {
    fn runner_slots(&self, project: &str) -> Slots {
        let mut slots = Slots {
            dispatched_today: self.runner_dispatched_today(project, now_secs()),
            ..Slots::default()
        };
        for entry in self
            .runner
            .entries
            .values()
            .filter(|e| e.project == project)
        {
            match entry.state {
                wire::RunnerEntryState::Queued => {}
                wire::RunnerEntryState::Running | wire::RunnerEntryState::Delivering => {
                    slots.in_flight += 1
                }
                wire::RunnerEntryState::Delivered => slots.open_prs += 1,
            }
        }
        slots
    }

    fn runner_set_hold(&mut self, project: &str, hold: Option<String>) -> bool {
        let changed = self.runner.holds.get(project) != hold.as_ref();
        match hold {
            Some(hold) => self.runner.holds.insert(project.to_string(), hold),
            None => self.runner.holds.remove(project),
        };
        changed
    }

    fn runner_set_waiting(&mut self, item_id: &str, reason: Option<String>) -> bool {
        let Some(mut entry) = self.runner.entries.get(item_id).cloned() else {
            return false;
        };
        if entry.waiting_reason == reason {
            return false;
        }
        entry.waiting_reason = reason;
        self.runner_put_entry(entry);
        true
    }

    /// The first enabled agent, for settings that name none.
    fn runner_default_agent(&self) -> String {
        self.configured_agents
            .iter()
            .find(|a| a.enabled)
            .map(|a| a.id.clone())
            .unwrap_or_default()
    }

    /// Why none of `spec`'s agents may start a new item now.
    fn runner_agent_refusal(
        &self,
        spec: &crate::workflow_config::WorkflowSpec,
        lead: &str,
        headroom_pct: u32,
    ) -> Option<String> {
        let now = now_secs();
        logic::pipeline_agents(spec, lead).iter().find_map(|agent| {
            self.dispatch_refusal(agent, SpawnAccount::Active)
                .or_else(|| {
                    logic::headroom_refusal(
                        &self.agent_limits,
                        self.agent_id_of(agent),
                        now,
                        headroom_pct,
                    )
                })
        })
    }

    /// Start as many queued items of `project` as its gates allow, in order.
    pub(crate) async fn runner_dispatch(&mut self, project: &str) {
        let mut changed = false;
        loop {
            let settings = self.runner_settings(project);
            let has_queued =
                !logic::dispatch_order(self.runner.entries.values(), project).is_empty();
            let mut hold =
                logic::slot_refusal(&settings, self.runner_slots(project)).filter(|_| has_queued);
            if hold.is_none() && has_queued && settings.min_free_gb > 0 {
                let free = self.project_path(project).as_deref().and_then(free_gb);
                if let Some(free) = free.filter(|free| *free < u64::from(settings.min_free_gb)) {
                    hold = Some(format!(
                        "{free} GB free on the project's disk (needs {} GB)",
                        settings.min_free_gb
                    ));
                }
            }
            changed |= self.runner_set_hold(project, hold.clone());
            if hold.is_some() || !has_queued {
                break;
            }
            let (started, touched) = self.runner_start_next(project, &settings).await;
            changed |= touched;
            if !started {
                break;
            }
        }
        if changed {
            self.runner_emit(project);
        }
    }

    /// Start the first queued entry whose item and agents allow it. Returns
    /// whether one started and whether any entry changed.
    async fn runner_start_next(
        &mut self,
        project: &str,
        settings: &wire::RunnerSettings,
    ) -> (bool, bool) {
        let order: Vec<String> = logic::dispatch_order(self.runner.entries.values(), project)
            .into_iter()
            .map(|e| e.item_id.clone())
            .collect();
        let path = self.project_path(project).unwrap_or_default();
        let mut touched = false;
        for item_id in order {
            let item = match self.runner_read_item(project, &item_id) {
                Ok(Some(item)) if !matches!(item.status.as_str(), "done" | "cancelled") => item,
                Ok(_) => {
                    self.runner_drop_entry(&item_id);
                    touched = true;
                    continue;
                }
                Err(error) => {
                    touched |= self.runner_set_waiting(&item_id, Some(format!("{error:#}")));
                    continue;
                }
            };
            let Some(entry) = self.runner.entries.get(&item_id).cloned() else {
                continue;
            };
            let workflow = entry
                .workflow
                .clone()
                .unwrap_or_else(|| settings.workflow.clone());
            let agent = entry
                .agent
                .clone()
                .or_else(|| Some(settings.agent.clone()).filter(|a| !a.is_empty()))
                .unwrap_or_else(|| self.runner_default_agent());
            let model = entry.model.clone().or_else(|| settings.model.clone());
            let spec =
                match crate::workflow_config::load_workflow(std::path::Path::new(&path), &workflow)
                    .map(|loaded| loaded.spec)
                {
                    Some(Ok(spec)) => spec,
                    Some(Err(error)) => {
                        let reason = format!("workflow `{workflow}` is invalid: {error}");
                        touched |= self.runner_set_waiting(&item_id, Some(reason));
                        continue;
                    }
                    None => {
                        let reason = format!("unknown workflow `{workflow}`");
                        touched |= self.runner_set_waiting(&item_id, Some(reason));
                        continue;
                    }
                };
            if agent.is_empty() {
                touched |=
                    self.runner_set_waiting(&item_id, Some("no agent is set up".to_string()));
                continue;
            }
            if let Some(reason) = self.runner_agent_refusal(&spec, &agent, settings.headroom_pct) {
                touched |= self.runner_set_waiting(&item_id, Some(reason));
                continue;
            }
            self.runner_start(entry, item, workflow, agent, model).await;
            return (true, true);
        }
        (false, touched)
    }

    async fn runner_start(
        &mut self,
        mut entry: wire::RunnerEntry,
        item: wire::BacklogItem,
        workflow: String,
        agent: String,
        model: Option<String>,
    ) {
        let now = now_secs();
        let project = entry.project.clone();
        entry.number = item.number;
        entry.title = item.title.clone();
        entry.priority = item.priority.clone();
        let mut run = wire::ItemRun {
            id: uuid::Uuid::new_v4().to_string(),
            project: project.clone(),
            item_id: item.id.clone(),
            item_number: item.number,
            item_title: item.title.clone(),
            task_id: None,
            workflow: workflow.clone(),
            agent: agent.clone(),
            model: model.clone(),
            enqueued_at: entry.enqueued_at,
            dispatched_at: now,
            finished_at: None,
            pr_opened_at: None,
            merged_at: None,
            closed_at: None,
            rounds: 0,
            fix_rounds: 0,
            cost_usd: None,
            outcome: wire::ItemRunOutcome::Running,
            detail: None,
            pr_url: None,
            pr_number: None,
        };
        self.runner.dispatches.push((project.clone(), now));
        let created = self
            .workflow_create(
                project.clone(),
                logic::brief(&item),
                agent,
                vec![logic::RUNNER_TAG.to_string()],
                true,
                StartPoint::Origin,
                workflow,
                Vec::new(),
                model,
                false,
                HashMap::new(),
                None,
                Some(item.id.clone()),
            )
            .await;
        match created {
            Ok(task_id) => {
                run.task_id = Some(task_id.clone());
                entry.state = wire::RunnerEntryState::Running;
                entry.task_id = Some(task_id.clone());
                entry.run_id = Some(run.id.clone());
                entry.waiting_reason = None;
                self.runner_put_entry(entry);
                self.runner_put_run(run, false);
                self.runner_write_item(&project, &item.id, "in_progress", Some(&task_id));
            }
            Err(error) => {
                run.outcome = wire::ItemRunOutcome::Failed;
                run.finished_at = Some(now);
                run.detail = Some(format!("the pipeline could not start: {error}"));
                self.runner_drop_entry(&item.id);
                self.runner_put_run(run, false);
            }
        }
    }
}
