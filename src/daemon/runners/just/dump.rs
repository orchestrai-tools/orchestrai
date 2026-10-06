//! `just --dump --dump-format json`, run with a deadline and turned into
//! command bar entries. The JSON shape is pinned by the fixture tests.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::Value;
use warpforge_protocol::{RunCommand, RunParam, RunParamKind, RunSource};

const DEADLINE: Duration = Duration::from_secs(5);

pub(super) enum Failure {
    /// `just` is not installed.
    Missing,
    /// `just` ran and refused the file, or did not answer in time.
    Error(String),
}

pub(super) fn run(bin: &str, file: &Path) -> Result<Value, Failure> {
    let mut child = Command::new(bin)
        .arg("--justfile")
        .arg(file)
        .args(["--dump", "--dump-format", "json"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => Failure::Missing,
            _ => Failure::Error(format!("could not run just: {error}")),
        })?;
    let mut stdout = child.stdout.take().expect("piped");
    let mut stderr = child.stderr.take().expect("piped");
    // Read on threads so a large dump cannot fill the pipe and stall `just`.
    let out = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let err = std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().ok().flatten() {
            break status;
        }
        if started.elapsed() > DEADLINE {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Failure::Error(
                "just took longer than 5 seconds to read the justfile".into(),
            ));
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    if !status.success() {
        let reason = stderr
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("just could not read the justfile");
        return Err(Failure::Error(reason.to_string()));
    }
    serde_json::from_slice(&stdout)
        .map_err(|error| Failure::Error(format!("just printed something unexpected: {error}")))
}

/// Every public recipe in the justfile and its modules.
pub(crate) fn commands(dump: &Value) -> Vec<RunCommand> {
    let mut out = Vec::new();
    walk(dump, true, &mut out);
    out
}

fn walk(module: &Value, root: bool, out: &mut Vec<RunCommand>) {
    let first = module.get("first").and_then(Value::as_str);
    let module_path = module
        .get("module_path")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty());
    let aliases = module.get("aliases").and_then(Value::as_object);
    if let Some(recipes) = module.get("recipes").and_then(Value::as_object) {
        for (name, recipe) in recipes {
            if recipe.get("private").and_then(Value::as_bool) == Some(true) || name.starts_with('_')
            {
                continue;
            }
            let attributes = recipe
                .get("attributes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let namepath = recipe
                .get("namepath")
                .and_then(Value::as_str)
                .unwrap_or(name)
                .to_string();
            let body = body_text(recipe.get("body"));
            let names_alias =
                |alias: &&Value| alias.get("target").and_then(Value::as_str) == Some(name.as_str());
            out.push(RunCommand {
                id: format!("just:{namepath}"),
                source: RunSource::Just,
                command: format!("just {namepath}"),
                description: recipe
                    .get("doc")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                group: attribute(&attributes, "group")
                    .and_then(|value| value.as_str().map(str::to_string))
                    .or_else(|| module_path.map(str::to_string)),
                params: params(recipe.get("parameters")),
                confirm: attribute(&attributes, "confirm")
                    .map(|value| value.as_str().unwrap_or_default().to_string()),
                aliases: aliases
                    .map(|all| {
                        all.values()
                            .filter(names_alias)
                            .filter_map(|alias| alias.get("name").and_then(Value::as_str))
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default(),
                long_running: super::super::long_running(&namepath, &body),
                is_default: root && first == Some(name.as_str()),
                exact: true,
                name: namepath,
            });
        }
    }
    if let Some(modules) = module.get("modules").and_then(Value::as_object) {
        for child in modules.values() {
            walk(child, false, out);
        }
    }
}

/// An attribute's value: `{"group": "check"}` gives `"check"`, a bare
/// `"confirm"` or `{"confirm": null}` gives `null`.
fn attribute<'a>(attributes: &'a [Value], key: &str) -> Option<&'a Value> {
    attributes.iter().find_map(|attribute| match attribute {
        Value::String(name) if name == key => Some(&Value::Null),
        Value::Object(map) => map.get(key),
        _ => None,
    })
}

fn params(value: Option<&Value>) -> Vec<RunParam> {
    let Some(list) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|param| {
            let name = param.get("name")?.as_str()?.to_string();
            let default = param.get("default").and_then(default_text);
            let kind = match param.get("kind").and_then(Value::as_str) {
                Some("plus") => RunParamKind::Plus,
                Some("star") => RunParamKind::Star,
                _ if param.get("default").is_some_and(|d| !d.is_null()) => RunParamKind::Optional,
                _ => RunParamKind::Required,
            };
            Some(RunParam {
                name,
                kind,
                default,
            })
        })
        .collect()
}

/// A literal default as text. An expression default (`"a" + b`) is left for
/// `just` to evaluate, so the field starts empty and may stay empty.
fn default_text(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string)
}

/// The recipe's lines with interpolations dropped, enough to spot a server.
fn body_text(body: Option<&Value>) -> String {
    let mut text = String::new();
    for line in body.and_then(Value::as_array).into_iter().flatten() {
        for fragment in line.as_array().into_iter().flatten() {
            if let Some(part) = fragment.as_str() {
                text.push_str(part);
            }
        }
        text.push('\n');
    }
    text
}
