//! `~/.warpforge/daemon.json`: where clients find the daemon and its token.

use std::io::Write;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

use anyhow::Result;
use warpforge_protocol as wire;

pub(super) fn daemon_json_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".warpforge")
        .join("daemon.json")
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
    };
    write_private(
        &daemon_json_path(),
        &serde_json::to_string_pretty(&endpoint)?,
    )
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
    use super::write_private;
    use std::os::unix::fs::PermissionsExt;

    fn mode(path: &std::path::Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn creates_the_directory_and_file_owner_only() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".warpforge");
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
}
