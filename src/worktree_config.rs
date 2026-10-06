//! The optional `worktree:` section of `.orchestrai/workspace.yaml`: what to
//! carry into, and run in, every new task worktree.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorktreeConfig {
    /// Globs, relative to the project root, of files copied into each new
    /// worktree.
    #[serde(default)]
    pub copy: Vec<String>,
    /// Shell command run in the new worktree once the files are copied.
    #[serde(default)]
    pub setup: Option<String>,
}

impl WorktreeConfig {
    /// Reject patterns that could reach outside the project root and blank
    /// commands.
    ///
    /// @returns `Ok` when every pattern is a valid relative glob.
    pub fn validate(&self) -> Result<()> {
        for pattern in &self.copy {
            if pattern.trim().is_empty() {
                bail!("worktree.copy contains an empty pattern");
            }
            if pattern.starts_with('/') || pattern.starts_with('\\') || pattern.contains(':') {
                bail!("worktree.copy pattern `{pattern}` must be relative to the project");
            }
            if pattern.split(['/', '\\']).any(|part| part == "..") {
                bail!("worktree.copy pattern `{pattern}` must not contain `..`");
            }
            if let Err(e) = glob::Pattern::new(pattern) {
                bail!("worktree.copy pattern `{pattern}` is invalid: {e}");
            }
        }
        if self.setup.as_deref().is_some_and(|s| s.trim().is_empty()) {
            bail!("worktree.setup is empty");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WorkspaceConfig;

    fn parse(yaml: &str) -> Result<WorktreeConfig> {
        let config: WorkspaceConfig = serde_yaml::from_str(yaml)?;
        let wt = config.worktree.unwrap_or_default();
        wt.validate()?;
        Ok(wt)
    }

    #[test]
    fn section_is_optional() {
        assert_eq!(parse("name: p\n").unwrap(), WorktreeConfig::default());
    }

    #[test]
    fn parses_copy_and_setup() {
        let wt = parse(
            "name: p\nworktree:\n  copy: ['.env*', config/local.json]\n  setup: bun install\n",
        )
        .unwrap();
        assert_eq!(wt.copy, vec![".env*", "config/local.json"]);
        assert_eq!(wt.setup.as_deref(), Some("bun install"));
    }

    #[test]
    fn rejects_unknown_keys() {
        assert!(parse("name: p\nworktree:\n  seed: true\n").is_err());
    }

    #[test]
    fn rejects_patterns_that_leave_the_project() {
        assert!(parse("name: p\nworktree:\n  copy: ['/etc/passwd']\n").is_err());
        assert!(parse("name: p\nworktree:\n  copy: ['../secret']\n").is_err());
        assert!(parse("name: p\nworktree:\n  copy: ['a/../../b']\n").is_err());
    }

    #[test]
    fn rejects_bad_globs_and_blank_values() {
        assert!(parse("name: p\nworktree:\n  copy: ['[']\n").is_err());
        assert!(parse("name: p\nworktree:\n  copy: ['']\n").is_err());
        assert!(parse("name: p\nworktree:\n  setup: '  '\n").is_err());
    }
}
