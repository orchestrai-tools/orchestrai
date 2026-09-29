//! The verify stage: a QA agent exercises the change in the running app and
//! reports pass/fail with a checklist and screenshots. Prompt, verdict
//! parsing and the routing that follows it.

use serde::{Deserialize, Serialize};
use warpforge_protocol as wire;

use super::parse::{extract_last_json_with_key, parse_findings, salvaged_prose};
use super::prompt::{finish_prompt, push_section, PromptCtx};
use super::{Finding, Severity, StageKind, WorkflowRun};
use crate::workflow_config::WorkflowSpec;

/// Which findings the next fix stage repairs.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FindingsSource {
    #[default]
    Review,
    Verify,
}

/// Where the pipeline goes after a verify stage reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyRoute {
    /// Passed: on to review.
    Review,
    /// Failed with attempts left: the findings go to a fix stage.
    Fix,
    /// A required verify failed out of attempts, or could not run: ask.
    Ask,
    /// The same with `required: false`: note it and continue to review.
    Skip,
}

/// A parsed verification verdict.
#[derive(Debug, Clone, PartialEq)]
pub struct VerifyReport {
    pub verdict: wire::WorkflowVerifyVerdict,
    pub summary: String,
    pub checklist: Vec<wire::WorkflowCheckItem>,
    /// What the fix stage gets on a failure; never empty for `Fail`.
    pub findings: Vec<Finding>,
}

const VERIFY_PROTOCOL: &str = "End your reply with exactly one fenced code block, and nothing \
after it, of this shape:\n\
```json\n{\"verdict\": \"fail\", \"summary\": \"one paragraph: what you tested and what you saw\", \
\"checklist\": [{\"step\": \"Open /settings and save a new name\", \"status\": \"fail\", \"note\": \
\"the toast said Saved but the name reverted on reload\", \"evidence\": [\"shot-2.png\"]}], \
\"findings\": [{\"severity\": \"high\", \"file\": null, \"description\": \"what you did, what you \
expected, what happened\"}]}\n```\n\
`verdict` is `pass` when every step of your plan behaved the way the task says, `fail` when \
something the task asks for does not work (list each problem in `findings`; `severity` is \
critical, high, medium or low, and `file` names the source file when you know it), or `blocked` \
when you could not run the check at all — services would not start for reasons unrelated to this \
change, no browser is available, the flow needs access you do not have — with the reason in \
`summary`. A service that no longer starts because of this change is a `fail`. A step's `status` \
is pass, fail or skipped, and `evidence` lists the screenshot names it relies on. Never report \
`pass` for something you did not see work in the browser.";

/// What the verify prompt adds to the common context.
#[derive(Debug, Default, Clone)]
pub struct VerifyCtx {
    pub attempt: u32,
    pub max_attempts: u32,
    /// Changed files, one per line.
    pub changed_files: Option<String>,
    /// The previous attempt's report, on a re-check after a fix.
    pub previous: Option<String>,
}

pub fn build_verify_prompt(spec: &WorkflowSpec, ctx: &PromptCtx, verify: &VerifyCtx) -> String {
    let mut out = format!(
        "You are the QA verification stage of a workflow pipeline (attempt {}/{}). The change \
         below is implemented; check in the running application that it does what the task \
         asks, the way a QA engineer would, from the user's side. Do NOT edit source files — \
         you are testing, not fixing.\n\n",
        verify.attempt, verify.max_attempts
    );
    push_section(&mut out, "Task", &ctx.task_prompt);
    if let Some(summary) = ctx.implementer_summary.as_deref() {
        push_section(&mut out, "What the implementer says it did", summary);
    }
    if let Some(files) = verify.changed_files.as_deref() {
        push_section(&mut out, "Changed files", files);
    }
    if let Some(instructions) = spec.verify.as_ref().and_then(|v| v.instructions.as_deref()) {
        push_section(&mut out, "Tester's instructions", instructions);
    }
    if let Some(previous) = verify.previous.as_deref() {
        push_section(
            &mut out,
            "Previous verification — re-check every failure",
            &format!(
                "{previous}\n\nA fix has run since. Re-test each failed step first, then run the \
                 rest of the plan again: the fix may have broken something that passed."
            ),
        );
    }
    push_section(
        &mut out,
        "How to verify",
        "1. Derive a short test plan from the task: the user flow it describes, the expected \
         result of each step, and the edge cases the task implies. Test what the task asks for, \
         not what the code happens to do.\n\
         2. Get the app running. `list_runtime` lists the project's dev services and their URLs. \
         Start a stopped service with `service_start`; restart one with `service_restart` when \
         it was already running before the change so it serves the new code. Read \
         `read_service_logs` when something does not come up or a request fails.\n\
         3. Walk the plan in the in-app browser: `browser_navigate` to the service URL, \
         `browser_snapshot` to read the page, `browser_click` and `browser_type` to act. The \
         project's own service URLs need no approval; do not visit other sites.\n\
         4. `browser_screenshot` every key state — before and after the main action, and every \
         failure. Each screenshot is kept as evidence and its result names it (e.g. \
         `shot-2.png`); cite those names in your checklist.\n\
         5. Call `browser_console` after the main flow. An uncaught error caused by this change \
         is a failure.\n\
         6. Check the outcome, not just the absence of errors: the page must show what the task \
         says it should.",
    );
    finish_prompt(out, VERIFY_PROTOCOL, ctx.guidance.as_deref())
}

/// Follow-up sent to a verify stage whose reply had no parseable verdict.
pub fn reask_verify_prompt(reason: &str) -> String {
    format!(
        "Your previous reply could not be parsed: {reason}. Reply with ONLY the fenced JSON \
         block:\n```json\n{{\"verdict\": \"pass\" | \"fail\" | \"blocked\", \"summary\": \"…\", \
         \"checklist\": [{{\"step\": \"…\", \"status\": \"pass\", \"evidence\": []}}], \
         \"findings\": []}}\n```"
    )
}

fn verdict_word(word: &str) -> Option<wire::WorkflowVerifyVerdict> {
    use wire::WorkflowVerifyVerdict::*;
    match word.trim().to_ascii_lowercase().as_str() {
        "pass" | "passed" | "ok" | "approve" => Some(Pass),
        "fail" | "failed" | "request_changes" => Some(Fail),
        "blocked" | "cannot_verify" | "inconclusive" => Some(Blocked),
        _ => None,
    }
}

fn check_status(word: &str) -> wire::WorkflowCheckStatus {
    match word.trim().to_ascii_lowercase().as_str() {
        "pass" | "passed" | "ok" => wire::WorkflowCheckStatus::Pass,
        "fail" | "failed" => wire::WorkflowCheckStatus::Fail,
        _ => wire::WorkflowCheckStatus::Skipped,
    }
}

fn text_of<'a>(item: &'a serde_json::Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn parse_checklist(value: &serde_json::Value) -> Vec<wire::WorkflowCheckItem> {
    let Some(items) = value.get("checklist").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let step = text_of(item, &["step", "name", "description"])?.to_string();
            let evidence = match item.get("evidence") {
                Some(serde_json::Value::String(one)) if !one.trim().is_empty() => {
                    vec![one.trim().to_string()]
                }
                Some(serde_json::Value::Array(many)) => many
                    .iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                _ => Vec::new(),
            };
            Some(wire::WorkflowCheckItem {
                step,
                status: check_status(text_of(item, &["status", "result"]).unwrap_or("")),
                note: text_of(item, &["note", "details", "actual"]).map(str::to_string),
                evidence,
            })
        })
        .collect()
}

/// Parse a verify stage's verdict. `Err` is a reason for the re-ask prompt.
///
/// A `pass` with a failed checklist step is read as a failure, and a failure
/// always carries findings — salvaged from failed steps or the agent's prose —
/// so a failed check can never reach review as if it passed.
pub fn parse_verify_verdict(text: &str, label: &str) -> Result<VerifyReport, String> {
    let Some(value) = extract_last_json_with_key(text, "verdict") else {
        return Err("no fenced JSON block with a `verdict` field found".to_string());
    };
    let word = value
        .get("verdict")
        .and_then(|v| v.as_str())
        .ok_or("the `verdict` field is not a string")?;
    let mut verdict = verdict_word(word).ok_or_else(|| {
        format!("verdict must be \"pass\", \"fail\" or \"blocked\", got \"{word}\"")
    })?;
    let checklist = parse_checklist(&value);
    let failed: Vec<&wire::WorkflowCheckItem> = checklist
        .iter()
        .filter(|item| item.status == wire::WorkflowCheckStatus::Fail)
        .collect();
    if verdict == wire::WorkflowVerifyVerdict::Pass && !failed.is_empty() {
        verdict = wire::WorkflowVerifyVerdict::Fail;
    }
    let mut summary = text_of(&value, &["summary"]).unwrap_or("").to_string();
    let mut findings = Vec::new();
    match verdict {
        wire::WorkflowVerifyVerdict::Fail => {
            findings = parse_findings(&value, label);
            if findings.is_empty() {
                findings = failed
                    .iter()
                    .map(|item| Finding {
                        severity: Severity::High,
                        file: None,
                        line: None,
                        snippet: None,
                        description: match item.note.as_deref() {
                            Some(note) => format!("Step failed: {} — {note}", item.step),
                            None => format!("Step failed: {}", item.step),
                        },
                        reviewer: label.to_string(),
                    })
                    .collect();
            }
            if findings.is_empty() {
                let prose = salvaged_prose(text);
                findings.push(Finding {
                    severity: Severity::Medium,
                    file: None,
                    line: None,
                    snippet: None,
                    description: if !summary.is_empty() {
                        summary.clone()
                    } else if !prose.is_empty() {
                        prose
                    } else {
                        "Verification failed without any detail. Re-test the task's flow and fix \
                         what does not work."
                            .to_string()
                    },
                    reviewer: label.to_string(),
                });
            }
        }
        wire::WorkflowVerifyVerdict::Blocked if summary.is_empty() => {
            summary = salvaged_prose(text);
        }
        _ => {}
    }
    Ok(VerifyReport {
        verdict,
        summary,
        checklist,
        findings,
    })
}

fn verdict_label(verdict: Option<wire::WorkflowVerifyVerdict>) -> &'static str {
    match verdict {
        Some(wire::WorkflowVerifyVerdict::Pass) => "PASS",
        Some(wire::WorkflowVerifyVerdict::Fail) => "FAIL",
        Some(wire::WorkflowVerifyVerdict::Blocked) => "BLOCKED",
        None => "RUNNING",
    }
}

/// Markdown for one verification: verdict, checklist and evidence. Used in the
/// timeline, the next attempt's prompt and the pipeline's final report.
pub fn format_verification(record: &wire::WorkflowVerification) -> String {
    let mut out = format!(
        "**Verification: {}** (attempt {})",
        verdict_label(record.verdict),
        record.attempt
    );
    if !record.summary.trim().is_empty() {
        out.push_str("\n\n");
        out.push_str(record.summary.trim());
    }
    if !record.checklist.is_empty() {
        out.push_str("\n\n");
        for item in &record.checklist {
            let status = match item.status {
                wire::WorkflowCheckStatus::Pass => "PASS",
                wire::WorkflowCheckStatus::Fail => "FAIL",
                wire::WorkflowCheckStatus::Skipped => "SKIP",
            };
            out.push_str(&format!("- **{status}** {}", item.step));
            if let Some(note) = item.note.as_deref() {
                out.push_str(&format!(" — {note}"));
            }
            if !item.evidence.is_empty() {
                out.push_str(&format!(" ({})", item.evidence.join(", ")));
            }
            out.push('\n');
        }
    }
    if !record.evidence.is_empty() {
        let names: Vec<&str> = record.evidence.iter().map(|e| e.name.as_str()).collect();
        out.push_str(&format!("\n\nScreenshots: {}", names.join(", ")));
    }
    out.trim_end().to_string()
}

impl WorkflowRun {
    /// Failed verifications allowed in a row, extensions included.
    pub fn verify_limit(&self) -> u32 {
        self.spec.verify.as_ref().map_or(0, |v| v.max_attempts) + self.verify_extra
    }

    /// The stage after a completed plan, implement or fix.
    /// @param stage the stage that completed
    /// @param code_changed whether a fix changed the working copy; unknown counts as changed
    /// @returns the next stage
    pub fn stage_after(&self, stage: StageKind, code_changed: bool) -> StageKind {
        let verify = self.spec.verify.is_some();
        match stage {
            StageKind::Plan => StageKind::Implement,
            StageKind::Implement if verify => StageKind::Verify,
            // A fix after a failed verification is always checked again; a fix
            // after a review only when it touched the code the last pass saw.
            StageKind::Fix
                if verify && (self.findings_source == FindingsSource::Verify || code_changed) =>
            {
                StageKind::Verify
            }
            _ => StageKind::Review,
        }
    }

    /// Where a verify verdict sends the run. Call after `verify_failures` has
    /// counted this attempt.
    pub fn route_verify(&self, verdict: wire::WorkflowVerifyVerdict) -> VerifyRoute {
        let required = self.spec.verify.as_ref().is_none_or(|v| v.required);
        match verdict {
            wire::WorkflowVerifyVerdict::Pass => VerifyRoute::Review,
            wire::WorkflowVerifyVerdict::Fail if self.verify_failures < self.verify_limit() => {
                VerifyRoute::Fix
            }
            _ if required => VerifyRoute::Ask,
            _ => VerifyRoute::Skip,
        }
    }

    /// The verification part of the final report: the latest attempt in
    /// full, flagged when the change ends without a pass.
    /// @returns `None` when no verify stage ran
    pub fn verification_section(&self) -> Option<String> {
        let last = self.verifications.last()?;
        let mut out = String::new();
        if last.verdict != Some(wire::WorkflowVerifyVerdict::Pass) {
            out.push_str("⚠ The change did not pass verification in the running app.\n\n");
        }
        out.push_str(&format_verification(last));
        if !self.verify_findings.is_empty()
            && last.verdict == Some(wire::WorkflowVerifyVerdict::Fail)
        {
            out.push_str(&format!(
                "\n\nUnresolved verification findings:\n{}",
                super::format_findings(&self.verify_findings)
            ));
        }
        if let Some(dir) = last
            .evidence
            .first()
            .and_then(|e| std::path::Path::new(&e.path).parent())
        {
            out.push_str(&format!(
                "\n\nScreenshots are stored in `{}`.",
                dir.display()
            ));
        }
        Some(out)
    }

    /// The verification record of a running verify child.
    pub fn verification_mut(&mut self, task_id: &str) -> Option<&mut wire::WorkflowVerification> {
        self.verifications
            .iter_mut()
            .rev()
            .find(|v| v.task_id.as_deref() == Some(task_id))
    }
}
