//! Running install/update commands: capture their output under a deadline and
//! kill the whole process tree on timeout.

use std::time::Duration;

/// Ceiling for a standalone install/update (the language-server path). A cold
/// npm on a slow network can take minutes; anything past this is stuck.
const MANAGE_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MANAGE_OUTPUT_TAIL: usize = 8192;
const MANAGE_READ_CAP: usize = 64 * 1024;

/// Run an install/update command via `sh -c`, capturing combined output.
/// Returns (success, output). Output is truncated to a sane size.
pub async fn run_manage_command(command: &str) -> (bool, String) {
    run_manage_command_with_timeout(command, MANAGE_TIMEOUT).await
}

/// [`run_manage_command`] with an explicit deadline. Runs in its own process
/// group so a timeout kills the package manager and its children, not just
/// `sh`.
pub(crate) async fn run_manage_command_with_timeout(
    command: &str,
    limit: Duration,
) -> (bool, String) {
    let mut shell = tokio::process::Command::new("sh");
    shell
        .args(["-c", command])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    shell.process_group(0);
    let mut child = match shell.spawn() {
        Ok(child) => child,
        Err(e) => return (false, format!("failed to run '{command}': {e}")),
    };
    #[cfg(unix)]
    let pgid = child.id();
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    // Read both pipes while waiting: a chatty installer that fills a pipe
    // buffer would otherwise deadlock against our own wait().
    let out_task = tokio::spawn(read_capped(stdout));
    let err_task = tokio::spawn(read_capped(stderr));

    let waited = tokio::time::timeout(limit, child.wait()).await;
    let timed_out = waited.is_err();
    let success = match waited {
        Ok(Ok(status)) => status.success(),
        Ok(Err(e)) => {
            out_task.abort();
            err_task.abort();
            return (false, format!("failed to run '{command}': {e}"));
        }
        Err(_) => {
            #[cfg(unix)]
            if let Some(pgid) = pgid {
                kill_process_group(pgid).await;
            }
            let _ = child.start_kill();
            let _ = child.wait().await;
            false
        }
    };

    let out = drain(out_task).await;
    let err = drain(err_task).await;
    let mut text = String::from_utf8_lossy(&out).to_string();
    text.push_str(&String::from_utf8_lossy(&err));
    if text.len() > MANAGE_OUTPUT_TAIL {
        let tail = text.len() - MANAGE_OUTPUT_TAIL;
        text = format!("…{}", &text[tail..]);
    }
    if timed_out {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&timeout_message(limit));
    }
    (success, text)
}

/// How long the deadline was, in the largest whole unit that fits.
fn timeout_message(limit: Duration) -> String {
    let secs = limit.as_secs();
    if secs >= 60 {
        format!("timed out after {} minutes", secs / 60)
    } else if secs >= 1 {
        format!("timed out after {secs} seconds")
    } else {
        format!("timed out after {} ms", limit.as_millis())
    }
}

#[cfg(unix)]
async fn kill_process_group(pgid: u32) {
    crate::signal::signal_group(pgid, libc::SIGKILL);
}

/// Await a pipe reader, giving up shortly after the child is gone so a
/// grandchild holding the pipe open cannot stall the request.
async fn drain(task: tokio::task::JoinHandle<Vec<u8>>) -> Vec<u8> {
    match tokio::time::timeout(Duration::from_secs(2), task).await {
        Ok(Ok(bytes)) => bytes,
        _ => Vec::new(),
    }
}

/// Read a pipe to EOF, keeping only the last [`MANAGE_READ_CAP`] bytes so a
/// long install log cannot grow the buffer without bound.
async fn read_capped(mut reader: impl tokio::io::AsyncRead + Unpin) -> Vec<u8> {
    use tokio::io::AsyncReadExt;
    let mut kept = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                kept.extend_from_slice(&buf[..n]);
                if kept.len() > MANAGE_READ_CAP {
                    let excess = kept.len() - MANAGE_READ_CAP;
                    kept.drain(..excess);
                }
            }
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn a_stuck_install_command_times_out_and_is_killed() {
        let started = std::time::Instant::now();
        let (ok, output) =
            run_manage_command_with_timeout("sleep 30", Duration::from_millis(300)).await;
        assert!(!ok);
        assert!(output.contains("timed out after 300 ms"), "{output}");
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_timed_out_install_kills_the_whole_process_group() {
        let dir = tempfile::tempdir().unwrap();
        let pid_path = dir.path().join("pid");
        let command = format!("sh -c 'sleep 600 & echo $! > {}; wait'", pid_path.display());
        let (ok, output) =
            run_manage_command_with_timeout(&command, Duration::from_millis(300)).await;
        assert!(!ok);
        assert!(output.contains("timed out after"), "{output}");

        let pid = std::fs::read_to_string(&pid_path)
            .expect("the grandchild should have reported its pid")
            .trim()
            .to_string();
        let gone = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let alive = tokio::process::Command::new("kill")
                    .args(["-0", &pid])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .await
                    .is_ok_and(|status| status.success());
                if !alive {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await;
        assert!(gone.is_ok(), "grandchild {pid} survived the group kill");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_finished_install_command_reports_its_output() {
        let (ok, output) =
            run_manage_command_with_timeout("printf 'installed ok\\n'", Duration::from_secs(5))
                .await;
        assert!(ok);
        assert!(output.contains("installed ok"), "{output}");
    }
}
