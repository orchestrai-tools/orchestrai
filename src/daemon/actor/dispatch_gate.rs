//! The quota gate in front of unattended dispatch: scheduled and manual
//! automation runs, workflow stages and orchestrator sub-agents. The verdict
//! itself lives in [`crate::daemon::limits::gate`].

use crate::daemon::accounts::SpawnAccount;
use crate::daemon::actor::Daemon;
use crate::daemon::workflow::{RunState, StageKind, WorkflowRun};
use crate::workflow_config::ReaskMode;

impl Daemon {
    /// Why starting `agent` on `account` must be refused right now, if it must.
    ///
    /// @param agent the agent as recorded on the task or automation (id or display name)
    /// @param account which account the run would start on
    /// @returns a user-facing refusal reason, or `None` to allow the dispatch
    pub(crate) fn dispatch_refusal(
        &self,
        agent: &str,
        account: SpawnAccount<'_>,
    ) -> Option<String> {
        let now = chrono::Utc::now().timestamp();
        crate::daemon::limits::gate::refusal(
            &self.agent_limits,
            self.agent_id_of(agent),
            account,
            now,
        )
    }

    /// The first refusal among the agents `stage` is about to start.
    pub(crate) fn workflow_stage_refusal(
        &self,
        run: &WorkflowRun,
        stage: StageKind,
    ) -> Option<String> {
        if stage != StageKind::Review {
            let (agent, _) = run.stage_agent(stage, None);
            return self.dispatch_refusal(&agent, SpawnAccount::Active);
        }
        // A repeat round continues each reviewer's previous session, which
        // stays on the account it started on.
        let reuses = run.round >= 1 && run.spec.review.reask == ReaskMode::SameSession;
        (0..run.spec.review.reviewers.len()).find_map(|index| {
            let (agent, _) = run.stage_agent(stage, Some(index));
            let account = match run.prior_review_children.get(&index) {
                Some(child) if reuses => self.spawn_account(child),
                _ => SpawnAccount::Active,
            };
            self.dispatch_refusal(&agent, account)
        })
    }

    /// Hold the run at the pause barrier before `stage` instead of starting it
    /// on an exhausted account; resuming re-checks the quota.
    pub(crate) fn workflow_park_on_quota(
        &mut self,
        parent_id: &str,
        mut run: WorkflowRun,
        stage: StageKind,
        reason: &str,
    ) {
        run.pause_requested = false;
        run.state = RunState::Paused {
            next: stage,
            reason: warpforge_protocol::WorkflowPauseReason::Quota,
            detail: reason.to_string(),
        };
        self.workflow_sync(&run);
        self.workflow_runs.insert(parent_id.to_string(), run);
        self.workflow_timeline(
            parent_id,
            format!(
                "Stage **{}** was not started: {reason}. Paused — resume once the quota resets.",
                stage.label()
            ),
        );
    }
}
