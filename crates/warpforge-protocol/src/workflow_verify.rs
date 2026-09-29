//! The workflow verify stage's report: verdict, checklist and the screenshots
//! kept as evidence. Carried on `WorkflowRunInfo.verifications`.

use serde::{Deserialize, Serialize};

/// One run of the verify stage.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowVerification {
    /// The verify stage task; absent when the stage was refused before an
    /// agent started (a task in its own worktree, say).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    /// 1-based attempt within the current run of failures.
    #[serde(default)]
    pub attempt: u32,
    /// `None` while the stage is still running.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verdict: Option<WorkflowVerifyVerdict>,
    /// The tester's one-paragraph conclusion, or why it could not test.
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub checklist: Vec<WorkflowCheckItem>,
    /// Screenshots taken during this attempt, in order.
    #[serde(default)]
    pub evidence: Vec<WorkflowEvidence>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowVerifyVerdict {
    Pass,
    Fail,
    /// The check could not be run: services would not start, no browser,
    /// missing access.
    Blocked,
}

/// One step of the tester's plan and what happened.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowCheckItem {
    pub step: String,
    pub status: WorkflowCheckStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Evidence names (`WorkflowEvidence.name`) the tester cited.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowCheckStatus {
    Pass,
    Fail,
    Skipped,
}

/// A screenshot kept from a verify stage's browser session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEvidence {
    /// Unique within the run, e.g. `shot-3.png`; read it with
    /// `workflow.evidence`.
    pub name: String,
    /// Where the daemon stored the file.
    pub path: String,
    pub mime_type: String,
}

/// The bytes of one evidence image, as returned by `workflow.evidence`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEvidenceImage {
    pub content_type: String,
    pub data_base64: String,
}
