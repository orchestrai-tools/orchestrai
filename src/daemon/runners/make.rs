//! Makefile targets. A `##` comment, after the target or on the line above,
//! is its description — the usual self-documenting Makefile convention.

use std::collections::HashSet;
use std::path::Path;

use warpforge_protocol::{RunCommand, RunCommands, RunSource};

const NAMES: &[&str] = &["GNUmakefile", "makefile", "Makefile"];

pub(super) fn read(dir: &Path, out: &mut RunCommands) {
    let Some(text) = NAMES
        .iter()
        .find_map(|name| std::fs::read_to_string(dir.join(name)).ok())
    else {
        return;
    };
    out.commands.extend(targets(&text));
}

pub(crate) fn targets(text: &str) -> Vec<RunCommand> {
    let lines: Vec<&str> = text.lines().collect();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let Some((names, rest)) = rule(line) else {
            continue;
        };
        let inline = rest.split_once("##").map(|(_, doc)| doc.trim());
        let above = index
            .checked_sub(1)
            .and_then(|i| lines[i].trim_start().strip_prefix("##"))
            .map(str::trim);
        let description = inline.or(above).filter(|doc| !doc.is_empty());
        let body: String = lines[index + 1..]
            .iter()
            .take_while(|l| l.starts_with('\t'))
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        for name in names {
            if !seen.insert(name.to_string()) {
                continue;
            }
            out.push(RunCommand {
                id: format!("make:{name}"),
                source: RunSource::Make,
                name: name.to_string(),
                command: format!("make {name}"),
                description: description.map(str::to_string),
                group: None,
                params: Vec::new(),
                confirm: None,
                aliases: Vec::new(),
                long_running: super::long_running(name, &body),
                is_default: false,
                exact: true,
            });
        }
    }
    out
}

/// The target names on a rule line and what follows the colon, or `None` for
/// recipes, comments, variables, special and pattern targets.
fn rule(line: &str) -> Option<(Vec<&str>, &str)> {
    if line.is_empty() || line.starts_with(['\t', ' ', '#']) {
        return None;
    }
    let colon = line.find(':')?;
    let (head, rest) = line.split_at(colon);
    let rest = &rest[1..];
    // `X := 1`, `X ::= 1`, `a:=b`; and `X = a:b` puts the `=` before the colon.
    if rest.starts_with('=') || rest.starts_with(":=") || head.contains('=') {
        return None;
    }
    let rest = rest.strip_prefix(':').unwrap_or(rest);
    let names: Vec<&str> = head
        .split_whitespace()
        .filter(|name| {
            !name.starts_with(['.', '_'])
                && !name.contains(['%', '$', '(', ')', '/'])
                && !name.ends_with(".o")
        })
        .collect();
    (!names.is_empty()).then_some((names, rest))
}
