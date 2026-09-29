use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::task::TaskStatus;
use crate::daemon::workflow::{
    self, FindingsSource, RunState, StageKind, VerifyRoute, WorkflowOutcome, WorkflowRun,
};

mod decide;
mod evidence;
mod fix_base;

use fix_base::changes;

/// Why a verify stage refuses a task in its own worktree (ADR 0024).
const WORKTREE_UNSUPPORTED: &str = "This task runs in its own worktree, but the project's dev \
services run from the main checkout, so they would not serve this change. Per-worktree services \
are not supported yet.";

impl Daemon {
    /// Start a verify stage, or refuse it when the task's change cannot be
    /// served by the project's services.
    pub(crate) async fn workflow_spawn_verify(&mut self, parent_id: &str, mut run: WorkflowRun) {
        let Some(parent) = self.tasks.get(parent_id) else {
            self.workflow_runs.insert(parent_id.to_string(), run);
            return;
        };
        let task_prompt = parent.prompt.clone();
        let title = parent.title.clone();
        let worktree = parent.worktree.clone();
        for record in run.verifications.iter_mut().filter(|v| v.verdict.is_none()) {
            record.verdict = Some(wire::WorkflowVerifyVerdict::Blocked);
            record.summary = "Interrupted before it reported.".to_string();
        }
        let attempt = run.verify_failures + 1;
        let max_attempts = run.verify_limit();
        run.state = RunState::Running {
            stage: StageKind::Verify,
        };
        if worktree.is_some() {
            run.verifications.push(wire::WorkflowVerification {
                task_id: None,
                attempt,
                verdict: Some(wire::WorkflowVerifyVerdict::Blocked),
                summary: WORKTREE_UNSUPPORTED.to_string(),
                checklist: Vec::new(),
                evidence: Vec::new(),
            });
            self.workflow_event(
                parent_id,
                wire::WorkflowEventKind::ReviewResult,
                "Verification could not run",
                Some(WORKTREE_UNSUPPORTED.to_string()),
                Some(StageKind::Verify),
                Vec::new(),
                wire::WorkflowEventTone::Warning,
            );
            // Boxed: routing can start the next stage, which is how we got here.
            Box::pin(self.workflow_verify_route(
                parent_id,
                run,
                wire::WorkflowVerifyVerdict::Blocked,
            ))
            .await;
            return;
        }

        let changed_files = changes(self.workflow_checkout(&run)).await.map(|files| {
            if files.is_empty() {
                "(no changes in the working copy)".to_string()
            } else {
                files
                    .iter()
                    .map(|f| format!("- {}", f.path))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        });
        let previous = run
            .verifications
            .last()
            .filter(|v| v.verdict == Some(wire::WorkflowVerifyVerdict::Fail))
            .map(workflow::format_verification);
        let ctx = workflow::PromptCtx {
            task_prompt,
            implementer_summary: run.last_summary.as_deref().map(workflow::clip_summary),
            guidance: run.take_guidance(),
            ..Default::default()
        };
        let verify_ctx = workflow::VerifyCtx {
            attempt,
            max_attempts,
            changed_files,
            previous,
        };
        let prompt = workflow::build_verify_prompt(&run.spec, &ctx, &verify_ctx);
        let (agent, model) = run.stage_agent(StageKind::Verify, None);
        let label = format!("verify {attempt}/{max_attempts}");
        // The runtime preamble lists the services and their URLs, which is
        // the first thing a tester needs, whatever the dialog picked.
        let spawned = self.workflow_spawn_child(
            &run.project,
            parent_id,
            &agent,
            model.clone(),
            prompt,
            None,
            format!("verify · {title}"),
            Vec::new(),
            true,
            run.config_overrides.clone(),
        );
        match spawned {
            Ok(child_id) => {
                run.active_children
                    .insert(child_id.clone(), StageKind::Verify);
                run.record_stage(StageKind::Verify, &child_id, &agent, label.clone());
                run.verifications.push(wire::WorkflowVerification {
                    task_id: Some(child_id.clone()),
                    attempt,
                    verdict: None,
                    summary: String::new(),
                    checklist: Vec::new(),
                    evidence: Vec::new(),
                });
                self.workflow_event(
                    parent_id,
                    wire::WorkflowEventKind::StageStarted,
                    format!("Verify started (attempt {attempt}/{max_attempts})"),
                    None,
                    Some(StageKind::Verify),
                    vec![wire::WorkflowEventAgent {
                        task_id: child_id,
                        label,
                        agent,
                        model,
                    }],
                    wire::WorkflowEventTone::Running,
                );
                self.workflow_sync(&run);
                self.workflow_runs.insert(parent_id.to_string(), run);
            }
            Err(child_id) => {
                run.record_stage(StageKind::Verify, &child_id, &agent, label);
                run.set_record_status(&child_id, wire::OrchNodeStatus::Failed);
                let reason = self
                    .tasks
                    .get(&child_id)
                    .and_then(|t| t.blocked_reason.clone())
                    .unwrap_or_else(|| "the agent session could not be started".to_string());
                self.workflow_runs.insert(parent_id.to_string(), run);
                let _ = self
                    .workflow_finalize(
                        parent_id,
                        WorkflowOutcome::Error(format!("stage verify could not start: {reason}")),
                    )
                    .await;
            }
        }
    }

    /// A verify stage's turn ended: parse its verdict, re-ask once on garbage,
    /// then route. A tester that never produces a verdict counts as blocked.
    pub(crate) async fn workflow_verify_finished(
        &mut self,
        parent_id: &str,
        mut run: WorkflowRun,
        child_id: &str,
        output: String,
    ) {
        let (agent, model) = run.stage_agent(StageKind::Verify, None);
        let label = format!("verify ({agent})");
        let event_agents: Vec<wire::WorkflowEventAgent> = run
            .history
            .iter()
            .rev()
            .find(|record| record.task_id == child_id)
            .map(|record| wire::WorkflowEventAgent {
                task_id: record.task_id.clone(),
                label: record.label.clone(),
                agent: record.agent.clone(),
                model: model.clone(),
            })
            .into_iter()
            .collect();
        let report = match workflow::parse_verify_verdict(&output, &label) {
            Ok(report) => report,
            Err(reason) => {
                self.workflow_event(
                    parent_id,
                    wire::WorkflowEventKind::AgentOutput,
                    "Verify: invalid response",
                    Some(workflow::display_output(&output)),
                    Some(StageKind::Verify),
                    event_agents.clone(),
                    wire::WorkflowEventTone::Warning,
                );
                let asked = run.reasked.entry(child_id.to_string()).or_insert(0);
                if *asked < workflow::MAX_VERDICT_REASKS {
                    *asked += 1;
                    if self.workflow_followup(child_id, workflow::reask_verify_prompt(&reason)) {
                        self.mark_task_running(child_id);
                        self.workflow_runs.insert(parent_id.to_string(), run);
                        return;
                    }
                }
                workflow::VerifyReport {
                    verdict: wire::WorkflowVerifyVerdict::Blocked,
                    summary: format!(
                        "The tester gave no parseable verdict after a retry ({reason})."
                    ),
                    checklist: Vec::new(),
                    findings: Vec::new(),
                }
            }
        };
        run.reasked.remove(child_id);
        run.active_children.remove(child_id);
        run.set_record_status(child_id, wire::OrchNodeStatus::Complete);
        self.workflow_set_child_status(child_id, TaskStatus::Done);
        let detail = run.verification_mut(child_id).map(|record| {
            record.verdict = Some(report.verdict);
            record.summary = report.summary.clone();
            record.checklist = report.checklist.clone();
            workflow::format_verification(record)
        });
        let (title, tone) = match report.verdict {
            wire::WorkflowVerifyVerdict::Pass => {
                run.verify_failures = 0;
                run.verify_extra = 0;
                run.verify_findings.clear();
                ("Verification passed", wire::WorkflowEventTone::Success)
            }
            wire::WorkflowVerifyVerdict::Fail => {
                run.verify_failures += 1;
                run.verify_findings = report.findings;
                run.findings_source = FindingsSource::Verify;
                ("Verification failed", wire::WorkflowEventTone::Warning)
            }
            wire::WorkflowVerifyVerdict::Blocked => (
                "Verification could not run",
                wire::WorkflowEventTone::Warning,
            ),
        };
        let detail = match (detail, report.verdict) {
            (Some(detail), wire::WorkflowVerifyVerdict::Fail) => Some(format!(
                "{detail}\n\n{}",
                workflow::format_findings(&run.verify_findings)
            )),
            (detail, _) => detail,
        };
        self.workflow_event(
            parent_id,
            wire::WorkflowEventKind::ReviewResult,
            title,
            detail,
            Some(StageKind::Verify),
            event_agents,
            tone,
        );
        self.workflow_verify_route(parent_id, run, report.verdict)
            .await;
    }

    async fn workflow_verify_route(
        &mut self,
        parent_id: &str,
        mut run: WorkflowRun,
        verdict: wire::WorkflowVerifyVerdict,
    ) {
        match run.route_verify(verdict) {
            VerifyRoute::Review => {
                self.workflow_runs.insert(parent_id.to_string(), run);
                self.workflow_advance(parent_id, StageKind::Review).await;
            }
            VerifyRoute::Fix => {
                self.workflow_timeline(
                    parent_id,
                    format!(
                        "Verification attempt {}/{} did not pass — sending its findings to a fix.",
                        run.verify_failures,
                        run.verify_limit()
                    ),
                );
                self.workflow_runs.insert(parent_id.to_string(), run);
                self.workflow_advance(parent_id, StageKind::Fix).await;
            }
            VerifyRoute::Ask => {
                let blocked = verdict == wire::WorkflowVerifyVerdict::Blocked;
                let barrier_id = run.next_barrier_id();
                run.state = RunState::AwaitingVerifyDecision {
                    barrier_id,
                    blocked,
                };
                self.workflow_timeline(
                    parent_id,
                    if blocked {
                        "Verification needs your input: it could not run. Retry it, continue to \
                         review without it, or stop. Anything you type goes to the next attempt."
                    } else {
                        "Verification needs your input: it failed on every attempt. Grant more \
                         attempts (a fix runs first), continue to review without a pass, or stop."
                    },
                );
                self.workflow_sync(&run);
                self.workflow_runs.insert(parent_id.to_string(), run);
            }
            VerifyRoute::Skip => {
                run.findings_source = FindingsSource::Review;
                self.workflow_timeline(
                    parent_id,
                    "Verification did not pass, but this workflow does not require it — \
                     continuing to review.",
                );
                self.workflow_runs.insert(parent_id.to_string(), run);
                self.workflow_advance(parent_id, StageKind::Review).await;
            }
        }
    }
}
