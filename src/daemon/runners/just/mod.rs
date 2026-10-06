//! Justfiles. Recipes are read by `just` itself (`--dump --dump-format json`)
//! so names, parameters, docs, groups, confirms, aliases, and modules are
//! exactly what `just` would run. When `just` is not installed, a text parser
//! finds what it can and the reply says so.

mod dump;
mod parse;

use std::path::{Path, PathBuf};

use warpforge_protocol::{RunCommands, RunSource, RunSourceNote};

#[cfg(test)]
pub(crate) use dump::commands as dump_commands;
#[cfg(test)]
pub(crate) use parse::recipes as parse_recipes;

/// Moves the `just` binary for tests; unset means `just` on PATH.
const BIN_ENV: &str = "ORCHESTRAI_JUST_BIN";

pub(super) fn binary() -> String {
    std::env::var(BIN_ENV)
        .ok()
        .filter(|bin| !bin.is_empty())
        .unwrap_or_else(|| "just".into())
}

/// The justfile `just` would use from `dir`: any capitalisation of `justfile`
/// or `.justfile`, in `dir` or a folder above it, stopping at `root`.
pub(crate) fn find(dir: &Path, root: &Path) -> Option<PathBuf> {
    let mut current = Some(dir);
    while let Some(folder) = current {
        if let Some(found) = in_folder(folder) {
            return Some(found);
        }
        if folder == root {
            break;
        }
        current = folder.parent().filter(|parent| parent.starts_with(root));
    }
    None
}

fn in_folder(folder: &Path) -> Option<PathBuf> {
    let mut names: Vec<PathBuf> = std::fs::read_dir(folder)
        .ok()?
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase());
            matches!(name.as_deref(), Some("justfile" | ".justfile"))
        })
        .collect();
    names.sort();
    names.into_iter().next()
}

pub(super) fn read(file: &Path, bin: &str, out: &mut RunCommands) {
    match dump::run(bin, file) {
        Ok(json) => out.commands.extend(dump::commands(&json)),
        Err(dump::Failure::Missing) => {
            if let Ok(text) = std::fs::read_to_string(file) {
                out.commands.extend(parse::recipes(&text));
            }
            out.hints.push(RunSourceNote {
                source: RunSource::Just,
                message: "Install just for exact recipes, parameters, and modules.".into(),
            });
        }
        Err(dump::Failure::Error(message)) => out.errors.push(RunSourceNote {
            source: RunSource::Just,
            message,
        }),
    }
}
