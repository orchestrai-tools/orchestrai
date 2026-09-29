//! What a prompt carries besides its text: attached files, images and
//! documents, and the summary of them a transcript keeps.

use serde::{Deserialize, Serialize};

/// 1-based, inclusive source line span.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LineRange {
    pub start: u32,
    pub end: u32,
}

/// A transient attachment sent with a prompt. Image data is never persisted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptAttachment {
    File {
        path: String,
        /// When present, only the inclusive line span is attached as context.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        range: Option<LineRange>,
    },
    Image {
        name: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
        data: String,
    },
    /// A text file uploaded inline with the prompt (never persisted). Distinct
    /// from `File`, which references a path inside the task worktree.
    Document {
        name: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
        /// UTF-8 file contents. Binary uploads are rejected on both the client
        /// and the daemon, so this is plain text rather than base64.
        text: String,
    },
}

/// Safe, persistence-friendly attachment metadata stored in the transcript.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptAttachmentSummary {
    File { path: String },
    Image { name: String },
    Document { name: String },
}
