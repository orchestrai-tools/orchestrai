//! The daemon's own standard streams. As a sidecar they are pipes the desktop
//! app owns; once the app is gone a write to one fails, and `eprintln!` panics
//! on a failed write — in the actor, that leaves a zombie daemon.

use std::fs::{self, File, OpenOptions};
use std::os::fd::AsFd;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::os::unix::io::AsRawFd;
use std::path::Path;
use std::time::Duration;

const LOG_NAME: &str = "daemon.log";
const LOG_ROTATE_BYTES: u64 = 10 * 1024 * 1024;
const STDIO_ENV: &str = "ORCHESTRAI_DAEMON_STDIO";
const LOG_CHECK_INTERVAL: Duration = Duration::from_secs(60);

/// Point stdin at /dev/null for every descendant. As a sidecar it is a pipe the
/// app never closes, so a child that reads stdin (a language server ignoring
/// `--version`) would never see EOF and would block `lsp.detect`.
pub(super) fn detach_stdin() {
    match std::fs::File::open("/dev/null") {
        // SAFETY: `null` owns a live descriptor for the duration of the call,
        // and fd 0 is a valid target.
        Ok(null) => unsafe {
            if libc::dup2(null.as_raw_fd(), libc::STDIN_FILENO) < 0 {
                eprintln!("orchestrai daemon: could not redirect stdin to /dev/null");
            }
        },
        Err(error) => eprintln!("orchestrai daemon: could not open /dev/null ({error})"),
    }
}

/// Move stdout and stderr off whatever the daemon was started with, unless it
/// cannot break: stderr is a terminal (`orchestrai daemon` run by hand), or the
/// dev app handed over its own stdio with `ORCHESTRAI_DAEMON_STDIO=inherit`.
pub(super) fn detach_output() {
    let inherit = std::env::var_os(STDIO_ENV).is_some_and(|value| value == "inherit");
    // A daemon started from one of this daemon's terminals must not inherit it.
    std::env::remove_var(STDIO_ENV);
    // SAFETY: `isatty` only inspects the descriptor.
    if inherit || unsafe { libc::isatty(libc::STDERR_FILENO) } == 1 {
        return;
    }
    let logs = Some(crate::registry::data_dir().join("logs"));
    redirect_output(logs.as_deref());
    if let Some(dir) = logs {
        let _ = std::thread::Builder::new()
            .name("daemon-log-rotation".into())
            .spawn(move || loop {
                std::thread::sleep(LOG_CHECK_INTERVAL);
                rotate_stderr(&dir, LOG_ROTATE_BYTES);
            });
    }
}

/// Move stderr to a fresh log once the file under it passes `rotate_bytes`.
/// It measures the descriptor, not the path: another daemon sharing the log
/// may already have renamed the file this one still writes to.
fn rotate_stderr(dir: &Path, rotate_bytes: u64) {
    let len = std::io::stderr()
        .as_fd()
        .try_clone_to_owned()
        .map(File::from)
        .and_then(|file| file.metadata());
    if !len.is_ok_and(|meta| meta.len() > rotate_bytes) {
        return;
    }
    if let Ok(log) = open_log(dir, rotate_bytes) {
        // SAFETY: `log` owns a live descriptor for the call, and fd 2 is valid.
        unsafe {
            libc::dup2(log.as_raw_fd(), libc::STDERR_FILENO);
        }
    }
}

/// Stdout goes to /dev/null rather than the log: the app never persisted it,
/// since it can carry protocol and prompt content.
fn redirect_output(logs: Option<&Path>) {
    let null = match OpenOptions::new().write(true).open("/dev/null") {
        Ok(null) => null,
        Err(error) => {
            eprintln!("orchestrai daemon: could not open /dev/null ({error})");
            return;
        }
    };
    let log = logs.and_then(|dir| open_log(dir, LOG_ROTATE_BYTES).ok());
    let stderr = log.as_ref().unwrap_or(&null);
    // SAFETY: both files own live descriptors for the duration of the calls,
    // and fds 1 and 2 are valid targets.
    let failed = unsafe {
        (libc::dup2(null.as_raw_fd(), libc::STDOUT_FILENO) < 0)
            | (libc::dup2(stderr.as_raw_fd(), libc::STDERR_FILENO) < 0)
    };
    if failed {
        eprintln!("orchestrai daemon: could not redirect stdout/stderr");
    }
    eprintln!(
        "--- orchestrai daemon {} started, pid {}, {}",
        env!("CARGO_PKG_VERSION"),
        std::process::id(),
        chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
    );
}

fn open_log(dir: &Path, rotate_bytes: u64) -> std::io::Result<File> {
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)?;
    let path = dir.join(LOG_NAME);
    if fs::metadata(&path).is_ok_and(|meta| meta.len() > rotate_bytes) {
        // A failed rotation must not cost the log: keep appending instead.
        let _ = fs::rename(&path, dir.join(format!("{LOG_NAME}.1")));
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .open(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::os::unix::fs::PermissionsExt;
    use std::process::{Command, Stdio};

    const MODE: &str = "ORCHESTRAI_STDIO_TEST_CHILD";
    const LOGS: &str = "ORCHESTRAI_STDIO_TEST_LOGS";
    const PANICKED: i32 = 3;
    const LINE: &str = "[acp t_1 <<?] non-JSON line: banner";
    const BEFORE_ROTATION: &str = "written before the rotation";

    /// A copy of this test binary that runs only [`child`] in `mode`, clear of
    /// the `ORCHESTRAI_DAEMON_STDIO` a dev daemon's terminals inherit.
    fn child_command(mode: &str) -> Command {
        let test = format!("{}::child", module_path!().split_once("::").unwrap().1);
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([test.as_str(), "--exact", "--nocapture", "--test-threads=1"])
            .env(MODE, mode)
            .env_remove(STDIO_ENV);
        command
    }

    /// Re-runs [`child`] and closes the read end of its stderr pipe before the
    /// child logs, as a vanished app leaves the sidecar's pipe.
    fn run_child(mode: &str, logs: &Path) -> (Option<i32>, String) {
        let mut child = child_command(mode)
            .env(LOGS, logs)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        drop(child.stderr.take());
        drop(child.stdin.take());
        let output = child.wait_with_output().unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        (output.status.code(), stdout)
    }

    /// Runs the real [`detach_output`] in a child whose stderr the parent keeps
    /// reading, with `$HOME` in a fresh directory. Returns that stderr.
    fn detach_in_child(stdio: Option<&str>) -> (String, tempfile::TempDir) {
        let home = tempfile::tempdir().unwrap();
        let mut command = child_command("detach");
        // Other tests in this binary set the data-folder override process-wide.
        command
            .env("HOME", home.path())
            .env_remove(warpforge_protocol::identity::HOME_ENV)
            .stdin(Stdio::null());
        if let Some(value) = stdio {
            command.env(STDIO_ENV, value);
        }
        let output = command.output().unwrap();
        assert_eq!(output.status.code(), Some(0));
        (String::from_utf8_lossy(&output.stderr).into_owned(), home)
    }

    #[test]
    fn child() {
        let Ok(mode) = std::env::var(MODE) else {
            return;
        };
        // EOF on stdin is the go-ahead: `run_child` has closed the stderr
        // reader by then.
        std::io::stdin().read_to_end(&mut Vec::new()).unwrap();
        match mode.as_str() {
            "log" => redirect_output(Some(Path::new(&std::env::var(LOGS).unwrap()))),
            "no-log" => redirect_output(Some(Path::new("/dev/null/logs"))),
            "detach" => {
                detach_output();
                let inherited = Command::new("sh")
                    .args(["-c", &format!("test -n \"${{{STDIO_ENV}+set}}\"")])
                    .status()
                    .unwrap();
                assert!(!inherited.success(), "a descendant inherited {STDIO_ENV}");
            }
            "rotate" => {
                let logs = std::env::var(LOGS).unwrap();
                redirect_output(Some(Path::new(&logs)));
                eprintln!("{BEFORE_ROTATION}");
                rotate_stderr(Path::new(&logs), 1);
            }
            _ => {}
        }
        match std::panic::catch_unwind(|| eprintln!("{LINE}")) {
            Ok(()) => std::process::exit(0),
            Err(panic) => {
                println!(
                    "{}",
                    panic.downcast_ref::<String>().map_or("", String::as_str)
                );
                std::process::exit(PANICKED);
            }
        }
    }

    #[test]
    fn eprintln_panics_once_the_stderr_pipe_has_no_reader() {
        let dir = tempfile::tempdir().unwrap();
        let (code, stdout) = run_child("pipe", dir.path());
        assert_eq!(code, Some(PANICKED), "{stdout}");
        assert!(stdout.contains("failed printing to stderr"), "{stdout}");
    }

    #[test]
    fn detached_stderr_outlives_the_reader_and_lands_in_the_log() {
        let dir = tempfile::tempdir().unwrap();
        let (code, stdout) = run_child("log", dir.path());
        assert_eq!(code, Some(0), "{stdout}");
        let log = fs::read_to_string(dir.path().join(LOG_NAME)).unwrap();
        assert!(log.contains(LINE), "{log}");
    }

    #[test]
    fn an_unopenable_log_falls_back_to_dev_null() {
        let dir = tempfile::tempdir().unwrap();
        let (code, stdout) = run_child("no-log", dir.path());
        assert_eq!(code, Some(0), "{stdout}");
    }

    #[test]
    fn the_dev_apps_inherit_request_keeps_stderr_and_is_not_passed_on() {
        let (stderr, home) = detach_in_child(Some("inherit"));
        assert!(stderr.contains(LINE), "{stderr}");
        assert!(!home.path().join(warpforge_protocol::identity::DIR).exists());
    }

    #[test]
    fn otherwise_a_piped_stderr_moves_into_the_home_log() {
        let (stderr, home) = detach_in_child(None);
        assert!(!stderr.contains(LINE), "{stderr}");
        let log = home
            .path()
            .join(warpforge_protocol::identity::DIR)
            .join("logs")
            .join(LOG_NAME);
        assert!(fs::read_to_string(log).unwrap().contains(LINE));
    }

    #[test]
    fn a_log_that_outgrows_the_cap_mid_run_is_rotated() {
        let dir = tempfile::tempdir().unwrap();
        let (code, stdout) = run_child("rotate", dir.path());
        assert_eq!(code, Some(0), "{stdout}");
        let old = fs::read_to_string(dir.path().join(format!("{LOG_NAME}.1"))).unwrap();
        let log = fs::read_to_string(dir.path().join(LOG_NAME)).unwrap();
        assert!(
            old.contains(BEFORE_ROTATION) && !old.contains(LINE),
            "{old}"
        );
        assert!(
            log.contains(LINE) && !log.contains(BEFORE_ROTATION),
            "{log}"
        );
    }

    #[test]
    fn a_rotation_that_fails_still_opens_the_log() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join(LOG_NAME);
        fs::write(&log, "too big\n").unwrap();
        fs::create_dir(dir.path().join(format!("{LOG_NAME}.1"))).unwrap();
        fs::write(dir.path().join(format!("{LOG_NAME}.1")).join("x"), "").unwrap();
        open_log(dir.path(), 1)
            .unwrap()
            .write_all(b"more\n")
            .unwrap();

        assert_eq!(fs::read_to_string(&log).unwrap(), "too big\nmore\n");
    }

    #[test]
    fn a_log_past_the_cap_is_rotated_keeping_one_old_file() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join(LOG_NAME);
        let old = dir.path().join(format!("{LOG_NAME}.1"));
        fs::write(&log, "first run\n").unwrap();
        open_log(dir.path(), 4).unwrap();
        fs::write(&log, "second run\n").unwrap();
        open_log(dir.path(), 4).unwrap();

        assert_eq!(fs::read_to_string(&old).unwrap(), "second run\n");
        assert_eq!(fs::read_to_string(&log).unwrap(), "");
        let mode = fs::metadata(&log).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn a_log_under_the_cap_is_appended_to() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join(LOG_NAME);
        fs::write(&log, "kept\n").unwrap();
        open_log(dir.path(), 1024)
            .unwrap()
            .write_all(b"more\n")
            .unwrap();

        assert_eq!(fs::read_to_string(&log).unwrap(), "kept\nmore\n");
        assert!(!dir.path().join(format!("{LOG_NAME}.1")).exists());
    }
}
