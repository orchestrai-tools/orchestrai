//! The names this build goes by on disk, on the PATH, and to agents. They
//! differ from stock Warpforge's so both can run on one machine without
//! sharing a data folder, an endpoint file, a binary, or an MCP server name.

use std::path::{Path, PathBuf};

pub const APP_NAME: &str = "OrchestrAI";
pub const BIN_NAME: &str = "orchestrai";
/// Name of the MCP server every agent session gets. Claude Code keeps one
/// server per name, so it must not match stock Warpforge's `warpforge`.
pub const MCP_SERVER: &str = "orchestrai";
/// Folder name for machine data under the home directory, and for the
/// per-repository config (`<repo>/.orchestrai/workspace.yaml`).
pub const DIR: &str = ".orchestrai";
/// Moves the machine data folder; tests point it at a temporary directory.
pub const HOME_ENV: &str = "ORCHESTRAI_HOME";

/// `$ORCHESTRAI_HOME`, else `<home>/.orchestrai`. The caller supplies the home
/// directory so this crate stays free of platform dependencies.
pub fn data_dir_from(home: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = std::env::var_os(HOME_ENV).filter(|dir| !dir.is_empty()) {
        return PathBuf::from(dir);
    }
    home.unwrap_or_else(|| PathBuf::from(".")).join(DIR)
}

/// The project's own config folder.
pub fn project_dir(project: &Path) -> PathBuf {
    project.join(DIR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_follows_the_override_then_the_home_directory() {
        std::env::remove_var(HOME_ENV);
        assert_eq!(
            data_dir_from(Some(PathBuf::from("/home/me"))),
            PathBuf::from("/home/me/.orchestrai")
        );
        std::env::set_var(HOME_ENV, "/tmp/elsewhere");
        assert_eq!(
            data_dir_from(Some(PathBuf::from("/home/me"))),
            PathBuf::from("/tmp/elsewhere")
        );
        std::env::remove_var(HOME_ENV);
    }

    #[test]
    fn the_names_do_not_collide_with_stock_warpforge() {
        assert_ne!(DIR, concat!(".", "warpforge"));
        assert_ne!(BIN_NAME, "warpforge");
        assert_ne!(MCP_SERVER, "warpforge");
    }
}
