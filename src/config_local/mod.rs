//! The personal, uncommitted `workspace.local.yaml` that overrides the shared
//! workspace config. Merge rules: see `merge.rs`; git hygiene: `ignore.rs`.

mod ignore;
mod merge;
#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde_yaml::Value;

use crate::config::{validate_worktree, WorkspaceConfig, CONFIG_NAMES};

pub(crate) use ignore::ensure_local_ignored;

/// Which services and port-forwards the local file added or changed, with the
/// fields it set on each.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LocalOverrides {
    pub services: BTreeMap<String, Vec<String>>,
    pub portforwards: BTreeMap<String, Vec<String>>,
}

/// The local file sitting beside whichever shared config names exist, in the
/// same priority order as the shared names.
///
/// @param project_path Project root.
/// @returns The first existing local file, if any.
pub(crate) fn find_local_config_file(project_path: &Path) -> Option<PathBuf> {
    CONFIG_NAMES
        .iter()
        .map(|name| {
            let stem = name.strip_suffix(".yaml").unwrap_or(name);
            project_path.join(format!("{stem}.local.yaml"))
        })
        .find(|path| path.is_file())
}

/// Apply the local override file, if any, on top of an already validated
/// shared config. A local file that cannot be applied never costs the project
/// its config: the shared config is returned with `local_error` set.
///
/// @param project_path Project root.
/// @param shared_path Path of the shared config, for error messages.
/// @param shared_text The shared file's text, or `None` for an auto-detected config.
/// @param shared The shared config parsed and validated on its own.
/// @returns `shared` unchanged without a local file, else the merged config.
pub(crate) fn overlay(
    project_path: &Path,
    shared_path: &Path,
    shared_text: Option<&str>,
    shared: WorkspaceConfig,
) -> Result<WorkspaceConfig> {
    let Some(local_path) = find_local_config_file(project_path) else {
        return Ok(shared);
    };
    match merged(project_path, &local_path, shared_path, shared_text, &shared) {
        Ok(Some(config)) => Ok(config),
        Ok(None) => Ok(shared),
        Err(e) => Ok(WorkspaceConfig {
            local_error: Some(format!("{e:#}")),
            ..shared
        }),
    }
}

fn merged(
    project_path: &Path,
    local_path: &Path,
    shared_path: &Path,
    shared_text: Option<&str>,
    shared: &WorkspaceConfig,
) -> Result<Option<WorkspaceConfig>> {
    let shown = |path: &Path| {
        path.strip_prefix(project_path)
            .unwrap_or(path)
            .display()
            .to_string()
    };
    let text =
        fs::read_to_string(local_path).with_context(|| format!("reading {}", shown(local_path)))?;
    let local: Value =
        serde_yaml::from_str(&text).with_context(|| format!("parsing {}", shown(local_path)))?;
    if local.is_null() {
        return Ok(None);
    }
    let base: Value = match shared_text {
        Some(text) => {
            serde_yaml::from_str(text).with_context(|| format!("parsing {}", shown(shared_path)))?
        }
        None => serde_yaml::to_value(shared)?,
    };
    let applying = || format!("applying {} over {}", shown(local_path), shown(shared_path));
    let (merged, overrides) = merge::merge_config(base, local).with_context(applying)?;
    let mut config: WorkspaceConfig = serde_yaml::from_value(merged).with_context(applying)?;
    validate_worktree(&config, local_path).with_context(applying)?;
    config.local = overrides;
    Ok(Some(config))
}
