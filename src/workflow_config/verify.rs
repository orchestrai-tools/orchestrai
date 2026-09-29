use serde::{Deserialize, Serialize};

/// Verification runs allowed to fail in a row before the pipeline asks the
/// user (or moves on, when `required: false`).
pub const DEFAULT_VERIFY_ATTEMPTS: u32 = 2;
pub const MAX_VERIFY_ATTEMPTS: u32 = 5;

/// The QA stage: an agent exercises the running app the way the task
/// describes and reports pass/fail with evidence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VerifyConfig {
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    /// Appended to the built-in verification prompt: logins, seed data, the
    /// route to start from.
    #[serde(default)]
    pub instructions: Option<String>,
    /// When true, the pipeline does not reach review without a pass: a run
    /// that cannot verify, or runs out of attempts, waits for the user.
    #[serde(default = "default_required")]
    pub required: bool,
    #[serde(default = "default_attempts")]
    pub max_attempts: u32,
}

fn default_required() -> bool {
    true
}

fn default_attempts() -> u32 {
    DEFAULT_VERIFY_ATTEMPTS
}

impl Default for VerifyConfig {
    fn default() -> Self {
        Self {
            agent: None,
            model: None,
            instructions: None,
            required: true,
            max_attempts: DEFAULT_VERIFY_ATTEMPTS,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct RawVerify {
    agent: Option<String>,
    model: Option<String>,
    instructions: Option<String>,
    required: Option<bool>,
    max_attempts: Option<u32>,
}

pub(super) const VERIFY_KEYS: &[&str] =
    &["agent", "model", "instructions", "required", "max_attempts"];

pub(super) fn build_verify(
    raw: RawVerify,
    warnings: &mut Vec<String>,
) -> Result<VerifyConfig, String> {
    let mut max_attempts = raw.max_attempts.unwrap_or(DEFAULT_VERIFY_ATTEMPTS);
    if max_attempts == 0 {
        return Err("verify.max_attempts must be at least 1".to_string());
    }
    if max_attempts > MAX_VERIFY_ATTEMPTS {
        warnings.push(format!(
            "verify.max_attempts {max_attempts} exceeds the cap, clamped to {MAX_VERIFY_ATTEMPTS}"
        ));
        max_attempts = MAX_VERIFY_ATTEMPTS;
    }
    Ok(VerifyConfig {
        agent: raw.agent,
        model: raw.model,
        instructions: raw
            .instructions
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty()),
        required: raw.required.unwrap_or(true),
        max_attempts,
    })
}
