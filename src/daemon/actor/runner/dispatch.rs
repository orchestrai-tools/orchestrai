//! Starting queued Factory tasks: the gates in front of each start, and the
//! choice of where it runs. The start itself is in `start.rs`.

use warpforge_protocol as wire;

use super::now_secs;
pub(super) use super::start::StartIn;
use crate::daemon::accounts::SpawnAccount;
use crate::daemon::actor::Daemon;
use crate::daemon::runner::{self as logic, Slots};

/// Free space on the volume holding `path`, in whole gigabytes.
#[allow(
    clippy::unnecessary_cast,
    reason = "statvfs field widths differ across supported platforms"
)]
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

/// A queued task and what it runs with, judged ready to start.
pub(super) struct Choice {
    pub entry: wire::RunnerEntry,
    pub item: Option<wire::BacklogItem>,
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
    hold: Option<wire::RunnerWait>,
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
                && self.runner_is_queued(&lease.task_id)
        });
        if preparing {
            slots.in_flight += 1;
            slots.dispatched_today += 1;
        }
        slots
    }

    fn runner_set_hold(&mut self, project: &str, hold: Option<wire::RunnerWait>) -> bool {
        let changed = self.runner.holds.get(project) != hold.as_ref();
        match hold {
            Some(hold) => self.runner.holds.insert(project.to_string(), hold),
            None => self.runner.holds.remove(project),
        };
        changed
    }

    pub(super) fn runner_set_waiting(
        &mut self,
        task_id: &str,
        wait: Option<wire::RunnerWait>,
    ) -> bool {
        let Some(mut entry) = self.runner.entries.get(task_id).cloned() else {
            return false;
        };
        if entry.wait == wait {
            return false;
        }
        entry.wait = wait;
        self.runner_put_entry(entry);
        true
    }

    /// The first enabled agent, for settings that name none.
    pub(super) fn runner_default_agent(&self) -> String {
        self.configured_agents
            .iter()
            .find(|a| a.enabled)
            .map(|a| a.id.clone())
            .unwrap_or_default()
    }

    /// The lead agent and model of a task in `project`. A model the agent
    /// does not list is dropped, so the agent runs on its own default.
    pub(super) fn runner_lead(
        &self,
        project: &str,
        agent: Option<&str>,
        model: Option<&str>,
    ) -> (String, Option<String>) {
        let settings = self.runner_settings(project);
        let (agent, model) =
            logic::resolve_lead(agent, model, &settings, &self.runner_default_agent());
        let model =
            model.filter(|m| crate::daemon::acp::model_fits(&self.configured_agents, &agent, m));
        (agent, model)
    }

    /// Why one of `spec`'s agents may not start a new task now. `force`
    /// skips the headroom threshold but never an exhausted account.
    fn runner_agent_refusal(
        &self,
        spec: &crate::workflow_config::WorkflowSpec,
        lead: &str,
        headroom_pct: u32,
        force: bool,
    ) -> Option<wire::RunnerWait> {
        let now = now_secs();
        let pct = if force { 100 } else { headroom_pct };
        logic::pipeline_agents(spec, lead).iter().find_map(|agent| {
            let agent_id = self.agent_id_of(agent);
            logic::headroom_refusal(&self.agent_limits, agent_id, now, pct).or_else(|| {
                self.dispatch_refusal(agent, SpawnAccount::Active).map(|_| {
                    wire::RunnerWait::Quota {
                        agent: agent_id.to_string(),
                        account: None,
                        window: None,
                        used_pct: Some(100),
                        limit_pct: None,
                        resets_at: None,
                    }
                })
            })
        })
    }

    /// Why nothing queued in `project` may start, whichever task it is.
    fn runner_project_wait(&self, project: &str) -> Option<wire::RunnerWait> {
        let settings = self.runner_settings(project);
        let now = now_secs();
        if let Some(held) = self.runner_held(project) {
            return Some(held);
        }
        let oldest = self.runner_oldest_today(project, now);
        if let Some(wait) = logic::slot_refusal(&settings, self.runner_slots(project), oldest) {
            return Some(wait);
        }
        if settings.min_free_gb == 0 {
            return None;
        }
        let free = self.project_path(project).as_deref().and_then(free_gb)?;
        (free < u64::from(settings.min_free_gb)).then_some(wire::RunnerWait::Disk {
            free_gb: free,
            min_gb: settings.min_free_gb,
        })
    }

    /// Start as many queued tasks of `project` as its gates allow, in order.
    pub(crate) async fn runner_dispatch(&mut self, project: &str) {
        let mut changed = false;
        loop {
            let has_queued =
                !logic::dispatch_order(self.runner.entries.values(), project).is_empty();
            if !has_queued {
                changed |= self.runner_set_hold(project, None);
                break;
            }
            if let Some(hold) = self.runner_project_wait(project) {
                changed |= self.runner_set_hold(project, Some(hold));
                break;
            }
            let pass = self.runner_start_next(project).await;
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
    async fn runner_start_next(&mut self, project: &str) -> Pass {
        let order: Vec<String> = logic::dispatch_order(self.runner.entries.values(), project)
            .into_iter()
            .map(|e| e.task_id.clone())
            .collect();
        let mut pass = Pass::default();
        let mut only_checkout_refused = true;
        for task_id in order {
            match self.runner_try_start(project, &task_id, false).await {
                Tried::Started => return Pass::started(),
                Tried::Wait => return pass,
                Tried::Skipped(changed) => {
                    pass.touched |= changed;
                    only_checkout_refused = false;
                }
                Tried::CheckoutRefused(wait, changed) => {
                    pass.touched |= changed;
                    pass.hold.get_or_insert(wait);
                }
            }
        }
        if !only_checkout_refused {
            pass.hold = None;
        }
        pass
    }

    /// Try to start queued `task_id` now. `force` is a person's Start now:
    /// it passes quota headroom, the slot counts having been skipped already.
    pub(super) async fn runner_try_start(
        &mut self,
        project: &str,
        task_id: &str,
        force: bool,
    ) -> Tried {
        let settings = self.runner_settings(project);
        let path = self.project_path(project).unwrap_or_default();
        let choice = match self.runner_pick(task_id, &settings, &path, force) {
            Ok(choice) => choice,
            Err(changed) => return Tried::Skipped(changed),
        };
        let preparing = self
            .runner
            .leases
            .get(project)
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Preparing);
        if choice.location == wire::RunLocation::Worktree {
            // Preparing the checkout fetches origin in the same repository
            // as a new worktree does; concurrent fetches race on the
            // remote-tracking ref. The switch dispatches again when done.
            if preparing {
                return Tried::Wait;
            }
            self.runner_start(choice, StartIn::Worktree).await;
            return Tried::Started;
        }
        let leased = choice.entry.deliver;
        match self.runner_checkout_refusal(project, leased) {
            None if leased => {
                if force {
                    self.runner.forced.insert(task_id.to_string());
                }
                self.runner_checkout_begin(&choice.entry);
                Tried::Started
            }
            None => {
                self.runner_start(choice, StartIn::InPlace).await;
                Tried::Started
            }
            Some(wait) => {
                let changed = self.runner_set_waiting(task_id, Some(wait.clone()));
                Tried::CheckoutRefused(wait, changed)
            }
        }
    }

    /// What queued `task_id` would run with, or whether judging it changed
    /// its entry (removed, or a new wait).
    pub(super) fn runner_pick(
        &mut self,
        task_id: &str,
        settings: &wire::RunnerSettings,
        path: &str,
        force: bool,
    ) -> Result<Choice, bool> {
        let Some(entry) = self.runner.entries.get(task_id).cloned() else {
            return Err(false);
        };
        let item = match entry.item_id.as_deref() {
            None => None,
            Some(item_id) => match self.runner_read_item(&entry.project, item_id) {
                Ok(Some(item)) if !matches!(item.status.as_str(), "done" | "cancelled") => {
                    Some(item)
                }
                Ok(_) => {
                    self.runner_discard_queued(task_id);
                    return Err(true);
                }
                Err(error) => {
                    let wait = wire::RunnerWait::Other {
                        detail: format!("{error:#}"),
                    };
                    return Err(self.runner_set_waiting(task_id, Some(wait)));
                }
            },
        };
        let workflow = entry
            .workflow
            .clone()
            .unwrap_or_else(|| settings.workflow.clone());
        let (agent, model) = self.runner_lead(
            &entry.project,
            entry.agent.as_deref(),
            entry.model.as_deref(),
        );
        let spec =
            match crate::workflow_config::load_workflow(std::path::Path::new(path), &workflow)
                .map(|loaded| loaded.spec)
            {
                Some(Ok(spec)) => spec,
                Some(Err(error)) => {
                    let wait = wire::RunnerWait::WorkflowInvalid {
                        workflow,
                        error: error.to_string(),
                    };
                    return Err(self.runner_set_waiting(task_id, Some(wait)));
                }
                None => {
                    let wait = wire::RunnerWait::WorkflowInvalid {
                        workflow,
                        error: "no workflow by that name".to_string(),
                    };
                    return Err(self.runner_set_waiting(task_id, Some(wait)));
                }
            };
        if agent.is_empty() {
            let wait = wire::RunnerWait::Other {
                detail: "no agent is set up".to_string(),
            };
            return Err(self.runner_set_waiting(task_id, Some(wait)));
        }
        if let Some(wait) = self.runner_agent_refusal(&spec, &agent, settings.headroom_pct, force) {
            return Err(self.runner_set_waiting(task_id, Some(wait)));
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
}

/// What trying to start one queued task did.
pub(super) enum Tried {
    Started,
    /// Nothing may start until the checkout finishes preparing.
    Wait,
    /// The task cannot start for a reason of its own; whether its entry changed.
    Skipped(bool),
    /// The project folder refused it; whether its entry changed.
    CheckoutRefused(wire::RunnerWait, bool),
}
