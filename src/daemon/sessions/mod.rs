//! Discover existing agent sessions on disk so a user can resume a prior
//! conversation (claude, codex, opencode, goose, or pi) as a warpforge task.
//!
//! Each agent keeps its own session store keyed by the working directory:
//!   - Claude: `~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl`, one file
//!     per session; the file stem is the ACP session id.
//!   - Codex:  `~/.codex/sessions/YYYY/MM/DD/rollout-*-<uuid>.jsonl`, whose first
//!     line is a `session_meta` frame carrying `payload.cwd` and `payload.id`.
//!     Titles live in `~/.codex/session_index.jsonl` (id → thread_name).
//!   - OpenCode: `opencode.db` under the data dir (`OPENCODE_DB`, else
//!     `OPENCODE_DATA_DIR` or `~/.local/share/opencode`). Rows in `session`
//!     whose `directory` is the project path. `time_updated` is milliseconds.
//!   - Goose: `sessions/sessions.db` under the data dir
//!     (`GOOSE_SESSIONS_DB`, else `~/.local/share/goose`). `working_dir` is the
//!     project path. `updated_at` is a UTC `YYYY-MM-DD HH:MM:SS` timestamp.
//!   - Pi: `~/.pi/agent/sessions/--<cwd>--/<timestamp>_<id>.jsonl`. The
//!     directory name drops the leading slash and replaces `/`, `\`, and `:`
//!     with `-`. The first line is a `session` header; a later `session_info`
//!     line carries the name.
//!
//! Everything here is blocking file IO — call it from `spawn_blocking`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::Value;
use warpforge_protocol as wire;

mod pi;

/// List resumable sessions for a project's working directory, newest first.
/// Only scans stores for agents that are configured and enabled (so a resume
/// can actually resolve to an ACP command).
pub fn external_sessions(
    project_path: &str,
    agents: &[wire::AgentConfig],
) -> Vec<wire::ExternalSession> {
    let enabled: Vec<&str> = agents
        .iter()
        .filter(|a| a.enabled)
        .map(|a| a.id.as_str())
        .collect();

    let mut out = Vec::new();
    if enabled.contains(&"claude") {
        out.extend(claude_sessions(project_path));
    }
    if enabled.contains(&"codex") {
        out.extend(codex_sessions(project_path));
    }
    if enabled.contains(&"opencode") {
        out.extend(opencode_sessions(project_path));
    }
    if enabled.contains(&"goose") {
        out.extend(goose_sessions(project_path));
    }
    if enabled.contains(&"pi") {
        out.extend(pi::sessions(project_path));
    }
    out.sort_by_key(|session| std::cmp::Reverse(session.updated_at));
    out
}

pub(super) fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn mtime_secs(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub(super) fn truncate(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}…")
    }
}

// ── Claude ────────────────────────────────────────────────────────────────

/// Claude escapes the absolute cwd into a directory name by replacing `/` and
/// `.` with `-` (so `/Users/x/proj` → `-Users-x-proj`).
fn claude_dir_name(project_path: &str) -> String {
    project_path
        .chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

fn claude_sessions(project_path: &str) -> Vec<wire::ExternalSession> {
    let Some(home) = home() else {
        return Vec::new();
    };
    let dir = home
        .join(".claude")
        .join("projects")
        .join(claude_dir_name(project_path));
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let (title, count) = claude_summary(&path);
        out.push(wire::ExternalSession {
            agent: "claude".into(),
            session_id: session_id.to_string(),
            title,
            updated_at: mtime_secs(&path),
            message_count: count,
        });
    }
    out
}

/// Read a claude session file for a title (a `summary`, else the first user
/// message) and a rough message count.
fn claude_summary(path: &Path) -> (String, u32) {
    let Ok(text) = std::fs::read_to_string(path) else {
        return (String::new(), 0);
    };
    let mut summary: Option<String> = None;
    let mut first_user: Option<String> = None;
    let mut count: u32 = 0;

    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("summary") => {
                if let Some(s) = v.get("summary").and_then(|s| s.as_str()) {
                    summary = Some(s.to_string());
                }
            }
            Some("user") => {
                count += 1;
                if first_user.is_none() {
                    if let Some(t) = message_text(v.get("message")) {
                        first_user = Some(t);
                    }
                }
            }
            Some("assistant") => count += 1,
            _ => {}
        }
    }
    let title = summary
        .or(first_user)
        .map(|t| truncate(&t, 100))
        .unwrap_or_default();
    (title, count)
}

/// Pull display text out of a claude `message` object whose `content` is either
/// a string or an array of `{type:"text", text}` blocks.
fn message_text(message: Option<&Value>) -> Option<String> {
    let content = message?.get("content")?;
    if let Some(s) = content.as_str() {
        return Some(s.to_string());
    }
    if let Some(arr) = content.as_array() {
        let joined: String = arr
            .iter()
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        if !joined.is_empty() {
            return Some(joined);
        }
    }
    None
}

// ── Codex ─────────────────────────────────────────────────────────────────

fn codex_sessions(project_path: &str) -> Vec<wire::ExternalSession> {
    let Some(home) = home() else {
        return Vec::new();
    };
    let sessions_dir = home.join(".codex").join("sessions");
    if !sessions_dir.is_dir() {
        return Vec::new();
    }

    let titles = codex_titles(&home);
    let mut files = Vec::new();
    collect_jsonl(&sessions_dir, &mut files);

    let mut out = Vec::new();
    for path in files {
        let Some((id, cwd)) = codex_meta(&path) else {
            continue;
        };
        if cwd != project_path {
            continue;
        }
        let title = titles.get(&id).cloned().unwrap_or_default();
        out.push(wire::ExternalSession {
            agent: "codex".into(),
            session_id: id,
            title: truncate(&title, 100),
            updated_at: mtime_secs(&path),
            message_count: 0,
        });
    }
    out
}

/// Parse `~/.codex/session_index.jsonl` into id → thread_name.
fn codex_titles(home: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let index = home.join(".codex").join("session_index.jsonl");
    let Ok(text) = std::fs::read_to_string(index) else {
        return map;
    };
    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if let (Some(id), Some(name)) = (
            v.get("id").and_then(|s| s.as_str()),
            v.get("thread_name").and_then(|s| s.as_str()),
        ) {
            map.insert(id.to_string(), name.to_string());
        }
    }
    map
}

/// Read a codex session file's first `session_meta` frame → (id, cwd).
fn codex_meta(path: &Path) -> Option<(String, String)> {
    use std::io::BufRead;
    let file = std::fs::File::open(path).ok()?;
    let mut first = String::new();
    std::io::BufReader::new(file).read_line(&mut first).ok()?;
    let v: Value = serde_json::from_str(first.trim()).ok()?;
    if v.get("type").and_then(|t| t.as_str()) != Some("session_meta") {
        return None;
    }
    let payload = v.get("payload")?;
    let id = payload.get("id").and_then(|s| s.as_str())?.to_string();
    let cwd = payload.get("cwd").and_then(|s| s.as_str())?.to_string();
    Some((id, cwd))
}

/// Recursively collect `*.jsonl` paths under `dir`.
fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

// ── OpenCode ──────────────────────────────────────────────────────────────

fn opencode_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("OPENCODE_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.trim().is_empty() {
            return PathBuf::from(xdg).join("opencode");
        }
    }
    home()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local/share/opencode")
}

fn opencode_db_path() -> PathBuf {
    if let Ok(path) = std::env::var("OPENCODE_DB") {
        let path = path.trim();
        if !path.is_empty() && path != ":memory:" {
            let path = PathBuf::from(path);
            return if path.is_absolute() {
                path
            } else {
                opencode_data_dir().join(path)
            };
        }
    }
    opencode_data_dir().join("opencode.db")
}

fn opencode_sessions(project_path: &str) -> Vec<wire::ExternalSession> {
    opencode_sessions_in(&opencode_db_path(), project_path)
}

fn opencode_sessions_in(db: &Path, project_path: &str) -> Vec<wire::ExternalSession> {
    let Ok(conn) =
        rusqlite::Connection::open_with_flags(db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return Vec::new();
    };
    let trimmed = project_path.trim_end_matches('/');
    let with_slash = format!("{trimmed}/");
    let Ok(mut stmt) = conn.prepare(
        "SELECT s.id, s.title, s.time_updated, \
         (SELECT COUNT(*) FROM message WHERE session_id = s.id) \
         FROM session s WHERE s.directory = ?1 OR s.directory = ?2",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map([trimmed, with_slash.as_str()], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }) else {
        return Vec::new();
    };
    rows.flatten()
        .map(|(id, title, updated, count)| wire::ExternalSession {
            agent: "opencode".into(),
            session_id: id,
            title: truncate(&title, 100),
            updated_at: if updated >= 1_000_000_000_000 {
                (updated / 1000) as u64
            } else {
                updated.max(0) as u64
            },
            message_count: u32::try_from(count.max(0)).unwrap_or(u32::MAX),
        })
        .collect()
}

fn goose_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("GOOSE_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.trim().is_empty() {
            return PathBuf::from(xdg).join("goose");
        }
    }
    home()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local/share/goose")
}

fn goose_db_path() -> PathBuf {
    if let Ok(path) = std::env::var("GOOSE_SESSIONS_DB") {
        let path = path.trim();
        if !path.is_empty() && path != ":memory:" {
            let path = PathBuf::from(path);
            return if path.is_absolute() {
                path
            } else {
                goose_data_dir().join(path)
            };
        }
    }
    goose_data_dir().join("sessions/sessions.db")
}

fn goose_sessions(project_path: &str) -> Vec<wire::ExternalSession> {
    goose_sessions_in(&goose_db_path(), project_path)
}

fn goose_stamp(stamp: &str) -> u64 {
    chrono::NaiveDateTime::parse_from_str(stamp.trim(), "%Y-%m-%d %H:%M:%S")
        .ok()
        .and_then(|time| time.and_utc().timestamp().try_into().ok())
        .unwrap_or(0)
}

fn goose_sessions_in(db: &Path, project_path: &str) -> Vec<wire::ExternalSession> {
    let Ok(conn) =
        rusqlite::Connection::open_with_flags(db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return Vec::new();
    };
    let trimmed = project_path.trim_end_matches('/');
    let with_slash = format!("{trimmed}/");
    let Ok(mut stmt) = conn.prepare(
        "SELECT s.id, CASE WHEN s.name = '' THEN s.description ELSE s.name END, s.updated_at, \
         (SELECT COUNT(*) FROM messages WHERE session_id = s.id) \
         FROM sessions s WHERE s.working_dir = ?1 OR s.working_dir = ?2",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map([trimmed, with_slash.as_str()], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }) else {
        return Vec::new();
    };
    rows.flatten()
        .map(|(id, title, updated, count)| wire::ExternalSession {
            agent: "goose".into(),
            session_id: id,
            title: truncate(&title, 100),
            updated_at: goose_stamp(&updated),
            message_count: u32::try_from(count.max(0)).unwrap_or(u32::MAX),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opencode_lists_the_matching_project() {
        let path = std::env::temp_dir().join(format!(
            "wf-opencode-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE session (id text, directory text, title text, time_updated integer);
             CREATE TABLE message (id text, session_id text);
             INSERT INTO session VALUES ('s1', '/demo', 'Port the shell', 1790901506426);
             INSERT INTO session VALUES ('s2', '/other', 'Elsewhere', 1790901506426);
             INSERT INTO message VALUES ('m1', 's1');
             INSERT INTO message VALUES ('m2', 's1');",
        )
        .unwrap();
        drop(conn);
        let found = opencode_sessions_in(&path, "/demo");
        let _ = std::fs::remove_file(&path);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].agent, "opencode");
        assert_eq!(found[0].session_id, "s1");
        assert_eq!(found[0].title, "Port the shell");
        assert_eq!(found[0].message_count, 2);
        assert_eq!(found[0].updated_at, 1_790_901_506);
    }

    #[test]
    fn goose_lists_the_matching_project() {
        let path = std::env::temp_dir().join(format!(
            "wf-goose-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (id text, name text, description text, working_dir text, updated_at text);
             CREATE TABLE messages (id integer, session_id text);
             INSERT INTO sessions VALUES ('g1', 'Name the column', '', '/demo', '2026-10-02 00:38:28');
             INSERT INTO sessions VALUES ('g2', 'Elsewhere', '', '/other', '2026-10-02 00:38:28');
             INSERT INTO messages VALUES (1, 'g1');",
        )
        .unwrap();
        drop(conn);
        let found = goose_sessions_in(&path, "/demo");
        let _ = std::fs::remove_file(&path);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].agent, "goose");
        assert_eq!(found[0].session_id, "g1");
        assert_eq!(found[0].title, "Name the column");
        assert_eq!(found[0].message_count, 1);
        assert_eq!(found[0].updated_at, 1_790_901_508);
    }
}
