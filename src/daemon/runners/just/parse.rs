//! Reading a justfile's text when `just` is not installed. A port of
//! Daintree's recipe matcher, extended to parameters, attribute lines and
//! aliases. It is a best guess; `exact: false` marks what it found.

use std::collections::{HashMap, HashSet};

use warpforge_protocol::{RunCommand, RunParam, RunParamKind, RunSource};

const SKIP_PREFIXES: &[&str] = &["alias ", "set ", "import ", "mod ", "export ", "unexport "];

pub(crate) fn recipes(text: &str) -> Vec<RunCommand> {
    let lines: Vec<&str> = text.lines().collect();
    let aliases = aliases(&lines);
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut first = true;
    for (index, line) in lines.iter().enumerate() {
        if line.starts_with([' ', '\t', '#', '[']) || line.trim().is_empty() {
            continue;
        }
        if SKIP_PREFIXES.iter().any(|prefix| line.starts_with(prefix)) {
            continue;
        }
        let Some((name, params)) = recipe_line(line) else {
            continue;
        };
        let above = Above::read(&lines[..index]);
        let is_first = std::mem::take(&mut first);
        if name.starts_with('_') || above.private || !seen.insert(name.to_string()) {
            continue;
        }
        let body: String = lines[index + 1..]
            .iter()
            .take_while(|l| l.starts_with([' ', '\t']) || l.trim().is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        out.push(RunCommand {
            id: format!("just:{name}"),
            source: RunSource::Just,
            name: name.to_string(),
            command: format!("just {name}"),
            description: above.doc,
            group: above.group,
            params,
            confirm: above.confirm,
            aliases: aliases.get(name).cloned().unwrap_or_default(),
            long_running: super::super::long_running(name, &body),
            is_default: above.default || is_first,
            exact: false,
        });
    }
    if out.iter().filter(|c| c.is_default).count() > 1 {
        // An explicit `[default]` beats being first in the file.
        let explicit = out.iter().position(|c| c.is_default && c.id != out[0].id);
        if let Some(keep) = explicit {
            for (i, command) in out.iter_mut().enumerate() {
                command.is_default = i == keep;
            }
        }
    }
    out
}

/// `name params...:` with an optional leading `@`; not `name := value`.
fn recipe_line(line: &str) -> Option<(&str, Vec<RunParam>)> {
    let line = line.strip_prefix('@').unwrap_or(line);
    let name_end = line
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.'))
        .unwrap_or(line.len());
    let name = &line[..name_end];
    if name.is_empty() || !name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') {
        return None;
    }
    let rest = &line[name_end..];
    let colon = colon_outside_quotes(rest)?;
    if rest[colon + 1..].starts_with('=') {
        return None;
    }
    Some((name, params(&rest[..colon])))
}

fn colon_outside_quotes(text: &str) -> Option<usize> {
    let mut quote = None;
    for (i, c) in text.char_indices() {
        match (quote, c) {
            (None, '"' | '\'') => quote = Some(c),
            (Some(q), _) if c == q => quote = None,
            (None, ':') => return Some(i),
            _ => {}
        }
    }
    None
}

fn params(text: &str) -> Vec<RunParam> {
    tokens(text)
        .into_iter()
        .filter_map(|token| {
            let (kind, token) = match token.chars().next()? {
                '+' => (Some(RunParamKind::Plus), &token[1..]),
                '*' => (Some(RunParamKind::Star), &token[1..]),
                _ => (None, token.as_str()),
            };
            let token = token.strip_prefix('$').unwrap_or(token);
            let (name, default) = match token.split_once('=') {
                Some((name, value)) => (name, Some(unquote(value))),
                None => (token, None),
            };
            let kind = kind.unwrap_or(if default.is_some() {
                RunParamKind::Optional
            } else {
                RunParamKind::Required
            });
            Some(RunParam {
                name: name.to_string(),
                kind,
                default,
            })
        })
        .collect()
}

/// Whitespace-separated, keeping quoted defaults with spaces in one token.
fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    for c in text.chars() {
        match (quote, c) {
            (None, '"' | '\'') => {
                quote = Some(c);
                current.push(c);
            }
            (Some(q), _) if c == q => {
                quote = None;
                current.push(c);
            }
            (None, c) if c.is_whitespace() => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn unquote(value: &str) -> String {
    let value = value.trim();
    for q in ['"', '\''] {
        if let Some(inner) = value.strip_prefix(q).and_then(|v| v.strip_suffix(q)) {
            return inner.to_string();
        }
    }
    value.to_string()
}

/// What the comment and attribute lines directly above a recipe say.
#[derive(Default)]
struct Above {
    doc: Option<String>,
    group: Option<String>,
    confirm: Option<String>,
    private: bool,
    default: bool,
}

impl Above {
    fn read(before: &[&str]) -> Self {
        let mut above = Self::default();
        for line in before.iter().rev().map(|l| l.trim()) {
            if let Some(inner) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
                for attribute in inner.split(',').map(str::trim) {
                    above.attribute(attribute);
                }
            } else if let Some(comment) = line.strip_prefix('#') {
                if above.doc.is_none() && !comment.starts_with('!') {
                    above.doc = Some(comment.trim().to_string()).filter(|d| !d.is_empty());
                }
                break;
            } else {
                break;
            }
        }
        above
    }

    fn attribute(&mut self, attribute: &str) {
        let (key, value) = match attribute.split_once('(') {
            Some((key, rest)) => (key.trim(), rest.strip_suffix(')').map(unquote)),
            None => (attribute, None),
        };
        match key {
            "private" => self.private = true,
            "default" => self.default = true,
            "group" => self.group = self.group.take().or(value),
            "doc" => self.doc = value,
            "confirm" => self.confirm = Some(value.unwrap_or_default()),
            _ => {}
        }
    }
}

fn aliases(lines: &[&str]) -> HashMap<String, Vec<String>> {
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for line in lines {
        let Some(rest) = line.strip_prefix("alias ") else {
            continue;
        };
        if let Some((alias, target)) = rest.split_once(":=") {
            out.entry(target.trim().to_string())
                .or_default()
                .push(alias.trim().to_string());
        }
    }
    out
}
