//! Starting queued items: the gates in front of each dispatch, then a
//! workflow pipeline in a fresh worktree forked from origin's default branch,
//! or in the project checkout on a task branch (`checkout/`).

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

/// A queued item and what it runs with, judged ready to start.
pub(super) struct Choice {
    pub entry: wire::RunnerEntry,
    pub item: wire::BacklogItem,
    pub workflow: String,
    pub agent: String,
    pub model: Option<String>,
    /// `worktree` or `checkout`.
    pub location: wire::RunLocation,
}

/// What one dispatch pass did.
#[derive(Default)]
struct Pass {
    started: bool,
    /// Whether any entry changed.
    touched: bool,
    /// The checkout's refusal, when it alone kept every queued entry back.
    hold: Option<String>,
}

impl Pass {
    fn started() -> Self {
        Self {
            started: true,
            touched: true,
            hold: None,
        }
    }
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
        let preparing = self.runner.leases.get(project).is_some_and(|lease| {
            lease.state == wire::CheckoutLeaseState::Preparing
                && self
                    .runner
                    .entries
                    .get(&lease.item_id)
                    .is_some_and(|e| e.state == wire::RunnerEntryState::Queued)
        });
        if preparing {
            slots.in_flight += 1;
            slots.dispatched_today += 1;
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
            if hold.is_some() || !has_queued {
                changed |= self.runner_set_hold(project, hold);
                break;
            }
            let pass = self.runner_start_next(project, &settings).await;
            changed |= pass.touched;
            if !pass.started {
                changed |= self.runner_set_hold(project, pass.hold);
                break;
            }
        }
        if changed {
            self.runner_emit(project);
        }
    }

    /// Start the first queued entry whose item, agents and run location
    /// allow it. A checkout entry the checkout gates refuse keeps the reason
    /// on its row and is skipped, so worktree entries behind it still start.
    async fn runner_start_next(&mut self, project: &str, settings: &wire::RunnerSettings) -> Pass {
        let order: Vec<String> = logic::dispatch_order(self.runner.entries.values(), project)
            .into_iter()
            .map(|e| e.item_id.clone())
            .collect();
        let path = self.project_path(project).unwrap_or_default();
        let preparing = self
            .runner
            .leases
            .get(project)
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Preparing);
        let mut pass = Pass::default();
        let mut only_checkout_refused = true;
        let mut checkout_gate: Option<Option<String>> = None;
        for item_id in order {
            let choice = match self.runner_pick(project, &item_id, settings, &path) {
                Ok(choice) => choice,
                Err(changed) => {
                    pass.touched |= changed;
                    only_checkout_refused = false;
                    continue;
                }
            };
            if choice.location == wire::RunLocation::Worktree {
                // Preparing the checkout fetches origin in the same repository
                // as a new worktree does; concurrent fetches race on the
                // remote-tracking ref. The switch dispatches again when done.
                if preparing {
                    pass.hold = None;
                    return pass;
                }
                self.runner_start(choice, None).await;
                return Pass::started();
            }
            let refusal = checkout_gate
                .get_or_insert_with(|| self.runner_checkout_refusal(project))
                .clone();
            match refusal {
                None => {
                    self.runner_checkout_begin(&choice.entry);
                    return Pass::started();
                }
                Some(reason) => {
                    pass.touched |= self.runner_set_waiting(&item_id, Some(reason.clone()));
                    pass.hold.get_or_insert(reason);
                }
            }
        }
        if !only_checkout_refused {
            pass.hold = None;
        }
        pass
    }

    /// What queued `item_id` would run with, or whether judging it changed
    /// its entry (dropped, or a new waiting reason).
    pub(super) fn runner_pick(
        &mut self,
        project: &str,
        item_id: &str,
        settings: &wire::RunnerSettings,
        path: &str,
    ) -> Result<Choice, bool> {
        let item = match self.runner_read_item(project, item_id) {
            Ok(Some(item)) if !matches!(item.status.as_str(), "done" | "cancelled") => item,
            Ok(_) => {
                self.runner_drop_entry(item_id);
                return Err(true);
            }
            Err(error) => return Err(self.runner_set_waiting(item_id, Some(format!("{error:#}")))),
        };
        let Some(entry) = self.runner.entries.get(item_id).cloned() else {
            return Err(false);
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
            match crate::workflow_config::load_workflow(std::path::Path::new(path), &workflow)
                .map(|loaded| loaded.spec)
            {
                Some(Ok(spec)) => spec,
                Some(Err(error)) => {
                    let reason = format!("workflow `{workflow}` is invalid: {error}");
                    return Err(self.runner_set_waiting(item_id, Some(reason)));
                }
                None => {
                    let reason = format!("unknown workflow `{workflow}`");
                    return Err(self.runner_set_waiting(item_id, Some(reason)));
                }
            };
        if agent.is_empty() {
            return Err(self.runner_set_waiting(item_id, Some("no agent is set up".to_string())));
        }
        if let Some(reason) = self.runner_agent_refusal(&spec, &agent, settings.headroom_pct) {
            return Err(self.runner_set_waiting(item_id, Some(reason)));
        }
        let location = logic::resolve_location(settings.run_location, entry.run_location, &spec);
        Ok(Choice {
            entry,
            item,
            workflow,
            agent,
            model,
            location,
        })
    }

    /// Start `choice`'s pipeline: in a fresh worktree, or with `checkout` =
    /// `(task id, origin's default branch)` in the project checkout, which is
    /// already on that task's branch.
    pub(super) async fn runner_start(
        &mut self,
        choice: Choice,
        checkout: Option<(String, String)>,
    ) {
        let Choice {
            mut entry,
            item,
            workflow,
            agent,
            model,
            location: _,
        } = choice;
        let location = match checkout {
            Some(_) => wire::RunLocation::Checkout,
            None => wire::RunLocation::Worktree,
        };
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
            run_location: Some(location),
        };
        self.runner.dispatches.push((project.clone(), now));
        let (preset_id, base) = checkout.unzip();
        let created = self
            .workflow_create(
                project.clone(),
                logic::brief(&item),
                agent,
                vec![logic::RUNNER_TAG.to_string()],
                preset_id.is_none(),
                StartPoint::Origin,
                workflow,
                Vec::new(),
                model,
                false,
                HashMap::new(),
                None,
                Some(item.id.clone()),
                preset_id,
            )
            .await;
        match created {
            Ok(task_id) => {
                if let Some(task) = self.tasks.get_mut(&task_id).filter(|_| base.is_some()) {
                    task.base_branch = base;
                    let updated = task.clone();
                    self.persist(&updated);
                }
                run.task_id = Some(task_id.clone());
                entry.state = wire::RunnerEntryState::Running;
                entry.task_id = Some(task_id.clone());
                entry.run_id = Some(run.id.clone());
                entry.resolved_location = Some(location);
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
