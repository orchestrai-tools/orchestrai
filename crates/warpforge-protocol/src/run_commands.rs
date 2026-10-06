//! Commands a project declares for the command bar: package scripts, just
//! recipes, and Makefile targets.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum RunSource {
    Npm,
    Just,
    Make,
}

/// How a parameter takes values: one required, one with a default, or a list.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunParamKind {
    /// Exactly one value, required.
    Required,
    /// Exactly one value, with a default.
    Optional,
    /// One or more values (`+name` in just).
    Plus,
    /// Zero or more values (`*name` in just).
    Star,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunParam {
    pub name: String,
    pub kind: RunParamKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunCommand {
    /// Stable within a project: `just:db::migrate`, `npm:dev`, `make:build`.
    pub id: String,
    pub source: RunSource,
    /// Script, target, or recipe name; a just recipe in a module keeps its path.
    pub name: String,
    /// The shell line that runs it with no parameters filled in.
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The justfile's `[group(...)]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub params: Vec<RunParam>,
    /// Set when it must be confirmed first: the justfile's message, or empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirm: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aliases: Vec<String>,
    /// Likely to keep running (a dev server, a watcher), so it opens in a terminal.
    #[serde(default)]
    pub long_running: bool,
    /// The justfile's default recipe.
    #[serde(default)]
    pub is_default: bool,
    /// Read by `just` itself rather than guessed from the file's text.
    #[serde(default = "default_true")]
    pub exact: bool,
}

fn default_true() -> bool {
    true
}

/// One line about a source: why it could not be read, or how to read it better.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunSourceNote {
    pub source: RunSource,
    pub message: String,
}

/// The reply to `shell.commands`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunCommands {
    pub commands: Vec<RunCommand>,
    /// Sources that exist but could not be read.
    #[serde(default)]
    pub errors: Vec<RunSourceNote>,
    /// Sources read with less detail than they could be.
    #[serde(default)]
    pub hints: Vec<RunSourceNote>,
}
