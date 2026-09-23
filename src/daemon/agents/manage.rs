//! Install/update commands for registry agents: pick the command that matches
//! how the binary was installed, and run it.

use super::detect::{package_manager_for_path, which, PackageManager};
use super::KnownAgent;

/// Append any co-install packages to an install/update command.
fn with_extras(agent: &KnownAgent, base: String) -> String {
    agent
        .extra_npm_packages
        .iter()
        .fold(base, |acc, extra| format!("{acc} {extra}@latest"))
}

/// The shell command that installs (when missing) or updates (when present) an
/// agent, given how its binary is installed. Returns the command string to run
/// via `sh -c`, or None when there is no safe automated path.
pub fn install_command(agent: &KnownAgent) -> Option<String> {
    if let Some(pkg) = agent.npm_package {
        Some(with_extras(agent, format!("npm install -g {pkg}@latest")))
    } else {
        agent.homebrew_formula.map(|f| format!("brew install {f}"))
    }
}

pub(super) fn update_command(agent: &KnownAgent, resolved_path: Option<&str>) -> Option<String> {
    if let Some(formula) = agent.homebrew_formula {
        // brew-managed agents always update via brew.
        if agent.npm_package.is_none() {
            return Some(format!("brew upgrade {formula}"));
        }
    }
    let pkg = agent.npm_package?;
    let manager = resolved_path.map(package_manager_for_path);
    match manager {
        Some(PackageManager::Bun) => Some(with_extras(agent, format!("bun add -g {pkg}@latest"))),
        Some(PackageManager::Pnpm) => Some(with_extras(agent, format!("pnpm add -g {pkg}@latest"))),
        Some(PackageManager::Homebrew) => {
            agent.homebrew_formula.map(|f| format!("brew upgrade {f}"))
        }
        // npm global, or a bare binary name with no path info → assume npm.
        Some(PackageManager::Npm) | None => {
            Some(with_extras(agent, format!("npm install -g {pkg}@latest")))
        }
        // Unrecognised install dir: use the agent's own upgrade command (e.g.
        // opencode's self-installed `~/.opencode/bin`), if it has one.
        Some(PackageManager::Unknown) => agent.custom_upgrade_command.map(|cmd| cmd.to_string()),
    }
}

/// Whether a registry version is a fair baseline for the installed binary. It
/// is only fair when the binary is upgradable through that channel: a
/// self-managed install can number its releases on an unrelated scheme and
/// would otherwise sit at "behind" forever with no way to update.
pub(super) fn registry_is_baseline(update: Option<&str>) -> bool {
    update.is_some()
}

/// Resolve the shell command to install (when missing) or update (when present)
/// an agent by id. None when the agent is unknown or unmanageable.
pub async fn manage_command(id: &str) -> Option<String> {
    let agent = super::known_agent(id)?;
    match which(agent.binary).await {
        Some(path) => update_command(agent, Some(&path)),
        None => install_command(agent),
    }
}

/// Run an install/update command via `sh -c`, capturing combined output.
/// Returns (success, output). Output is truncated to a sane size.
pub async fn run_manage_command(command: &str) -> (bool, String) {
    let result = tokio::process::Command::new("sh")
        .args(["-c", command])
        .output()
        .await;
    match result {
        Ok(output) => {
            let mut text = String::from_utf8_lossy(&output.stdout).to_string();
            text.push_str(&String::from_utf8_lossy(&output.stderr));
            if text.len() > 8192 {
                let tail = text.len() - 8192;
                text = format!("…{}", &text[tail..]);
            }
            (output.status.success(), text)
        }
        Err(e) => (false, format!("failed to run '{command}': {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_managed_install_is_not_compared_to_the_registry() {
        // junie on PATH is its own auto-updating launcher under ~/.local/bin and
        // numbers releases on a scheme unrelated to @jetbrains/junie-cli.
        let junie = super::super::known_agent("junie").unwrap();
        let update = update_command(junie, Some("/Users/u/.local/bin/junie"));
        assert_eq!(update, None);
        assert!(!registry_is_baseline(update.as_deref()));
    }

    #[test]
    fn npm_managed_install_is_compared_to_the_registry() {
        let qwen = super::super::known_agent("qwen").unwrap();
        let update = update_command(
            qwen,
            Some("/opt/homebrew/lib/node_modules/@qwen-code/qwen-code/bin/qwen.js"),
        );
        assert!(update.is_some());
        assert!(registry_is_baseline(update.as_deref()));
    }
}
