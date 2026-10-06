//! `~/.orchestrai/daemon.json`: where clients find the daemon and its token.

use std::io::Write;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

use anyhow::Result;
use warpforge_protocol as wire;

pub(super) fn daemon_json_path() -> PathBuf {
    crate::registry::data_dir().join("daemon.json")
}

/// Remove `daemon.json` on exit, unless a daemon started since has already
/// replaced it with its own.
pub(super) fn remove_endpoint() {
    remove_if_published_by(&daemon_json_path(), std::process::id());
}

fn remove_if_published_by(path: &Path, pid: u32) {
    let published = std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|endpoint| endpoint.get("pid").and_then(serde_json::Value::as_u64));
    if published == Some(u64::from(pid)) {
        std::fs::remove_file(path).ok();
    }
}

pub(super) fn write_endpoint(
    addr: SocketAddr,
    token: &str,
    owner: wire::DaemonOwner,
) -> Result<()> {
    let endpoint = wire::DaemonEndpoint {
        pid: std::process::id(),
        url: format!("ws://{addr}"),
        token: token.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        protocol_version: wire::PROTOCOL_VERSION,
        owner,
        exe: std::env::current_exe()
            .and_then(std::fs::canonicalize)
            .ok()
            .map(|path| path.to_string_lossy().into_owned()),
        started_at: start_time(std::process::id()),
    };
    write_private(
        &daemon_json_path(),
        &serde_json::to_string_pretty(&endpoint)?,
    )
}

/// This process's start time, read the way the desktop shell reads it for a
/// pid it finds in `daemon.json` (`desktop/src-tauri/src/daemon/process.rs`).
#[cfg(target_os = "macos")]
fn start_time(pid: u32) -> Option<u64> {
    let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::zeroed();
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: `info` is writable for `size` bytes.
    let written = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written != size {
        return None;
    }
    // SAFETY: `proc_pidinfo` filled all `size` bytes.
    let info = unsafe { info.assume_init() };
    Some(info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec)
}

#[cfg(target_os = "linux")]
fn start_time(pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // `starttime` is field 22; the split starts at field 3, after the command name.
    stat.rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(19)?
        .parse()
        .ok()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn start_time(_pid: u32) -> Option<u64> {
    None
}

/// Replace `path` with `text`, readable only by the current user. The text
/// goes to a 0600 temp file in the same directory first, so the token is
/// never in a file with wider permissions, not even briefly.
fn write_private(path: &Path, text: &str) -> Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    create_private_dir(dir)?;
    let tmp = dir.join(format!(".daemon.json.{}.tmp", std::process::id()));
    std::fs::remove_file(&tmp).ok();
    let written = open_private(&tmp).and_then(|mut file| {
        file.write_all(text.as_bytes())?;
        file.sync_all()
    });
    match written.and_then(|()| std::fs::rename(&tmp, path)) {
        Ok(()) => Ok(()),
        Err(error) => {
            std::fs::remove_file(&tmp).ok();
            Err(error.into())
        }
    }
}

#[cfg(unix)]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
}

#[cfg(not(unix))]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

#[cfg(unix)]
fn open_private(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn open_private(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
}

#[cfg(all(test, unix))]
mod tests {
    use super::{remove_if_published_by, start_time, write_private};
    use std::os::unix::fs::PermissionsExt;

    fn mode(path: &std::path::Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn creates_the_directory_and_file_owner_only() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(warpforge_protocol::identity::DIR);
        let path = dir.join("daemon.json");

        write_private(&path, "{\"token\":\"a\"}").unwrap();

        assert_eq!(mode(&dir), 0o700);
        assert_eq!(mode(&path), 0o600);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"token\":\"a\"}");
    }

    #[test]
    fn replaces_a_readable_file_and_leaves_an_existing_dir_alone() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
        let path = dir.path().join("daemon.json");
        std::fs::write(&path, "old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();

        write_private(&path, "new").unwrap();

        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(dir.path()), 0o755);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        let leftovers = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(leftovers, 1, "the temp file is renamed away");
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn the_start_time_is_stable_and_gone_with_the_process() {
        let own = start_time(std::process::id());
        assert!(own.is_some());
        assert_eq!(start_time(std::process::id()), own);
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        assert_eq!(start_time(pid), None);
    }

    #[test]
    fn an_exiting_daemon_leaves_a_newer_daemons_endpoint_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("daemon.json");

        std::fs::write(&path, r#"{"pid": 7, "url": "ws://127.0.0.1:1"}"#).unwrap();
        remove_if_published_by(&path, 6);
        assert!(path.exists());

        remove_if_published_by(&path, 7);
        assert!(!path.exists());
    }
}
