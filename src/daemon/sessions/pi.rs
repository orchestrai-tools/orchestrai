//! Pi sessions live in `~/.pi/agent/sessions/--<cwd>--/*.jsonl`.

use std::io::BufRead;
use std::path::{Path, PathBuf};

use serde_json::Value;
use warpforge_protocol as wire;

pub(super) fn sessions(project_path: &str) -> Vec<wire::ExternalSession> {
    sessions_in(&sessions_dir(), project_path)
}

fn sessions_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("PI_AGENT_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir).join("sessions");
        }
    }
    super::home()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".pi/agent/sessions")
}

/// `/Users/x/proj` becomes `--Users-x-proj--`.
fn dir_name(project_path: &str) -> String {
    let rest = project_path
        .trim_end_matches(['/', '\\'])
        .trim_start_matches(['/', '\\']);
    let encoded: String = rest
        .chars()
        .map(|ch| {
            if matches!(ch, '/' | '\\' | ':') {
                '-'
            } else {
                ch
            }
        })
        .collect();
    format!("--{encoded}--")
}

pub(super) fn sessions_in(root: &Path, project_path: &str) -> Vec<wire::ExternalSession> {
    let dir = root.join(dir_name(project_path));
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| read_session(&entry.path()))
        .collect()
}

fn read_session(path: &Path) -> Option<wire::ExternalSession> {
    if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
        return None;
    }
    let file = std::fs::File::open(path).ok()?;
    let mut id = String::new();
    let mut title = String::new();
    let mut updated_at = 0;
    let mut messages = 0u32;
    for line in std::io::BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let Ok(value) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        match value.get("type").and_then(|kind| kind.as_str()) {
            Some("session") if id.is_empty() => {
                id = value.get("id").and_then(|item| item.as_str())?.to_string();
                updated_at = stamp(value.get("timestamp").and_then(|item| item.as_str()));
            }
            Some("session_info") => {
                if let Some(name) = value.get("name").and_then(|item| item.as_str()) {
                    if !name.trim().is_empty() {
                        title = name.to_string();
                    }
                }
            }
            Some("message") => messages = messages.saturating_add(1),
            _ => {}
        }
    }
    if id.is_empty() {
        return None;
    }
    Some(wire::ExternalSession {
        agent: "pi".into(),
        session_id: id,
        title: super::truncate(&title, 100),
        updated_at,
        message_count: messages,
    })
}

fn stamp(value: Option<&str>) -> u64 {
    value
        .and_then(|text| chrono::DateTime::parse_from_rfc3339(text).ok())
        .and_then(|time| u64::try_from(time.timestamp()).ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_the_session_for_the_encoded_project() {
        let root = std::env::temp_dir().join(format!(
            "wf-pi-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let dir = root.join("--demo--");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("2026_p1.jsonl"),
            "{\"type\":\"session\",\"id\":\"p1\",\"timestamp\":\"2026-10-02T00:38:28.000Z\",\"cwd\":\"/demo\"}\n\
             {\"type\":\"message\",\"id\":\"m1\"}\n\
             {\"type\":\"session_info\",\"name\":\"Name the board\"}\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("--other--")).unwrap();
        let found = sessions_in(&root, "/demo");
        let _ = std::fs::remove_dir_all(&root);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].agent, "pi");
        assert_eq!(found[0].session_id, "p1");
        assert_eq!(found[0].title, "Name the board");
        assert_eq!(found[0].message_count, 1);
        assert_eq!(found[0].updated_at, 1_790_901_508);
    }
}
