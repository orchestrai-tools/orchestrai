//! Reclaiming a local port held by a `kubectl port-forward` left behind by an
//! earlier daemon. Only the process listening on that port is considered, and
//! only when its own command line is that forward.

use tokio::process::Command;

/// Whether `args`, a process's command line, is a `kubectl port-forward`
/// whose local side is `port`.
///
/// @param args the process's arguments, space separated
/// @param port the local port being reclaimed
/// @returns true only for a kubectl port-forward of `port`
pub(super) fn is_forward_of(args: &str, port: u16) -> bool {
    let mut tokens = args.split_whitespace();
    let is_kubectl = tokens
        .next()
        .and_then(|exe| exe.rsplit('/').next())
        .is_some_and(|exe| exe == "kubectl");
    let local = format!("{port}:");
    let rest: Vec<&str> = tokens.collect();
    is_kubectl
        && rest.contains(&"port-forward")
        && rest.iter().any(|token| token.starts_with(&local))
}

async fn stdout_of(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .await
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default()
}

/// SIGTERM the stale `kubectl port-forward` listening on `port`, if any.
///
/// @param port the local port a new forward needs
pub(super) async fn kill_stale_port_forward(port: u16) {
    let spec = format!("-iTCP:{port}");
    let listeners = stdout_of("lsof", &["-nP", "-t", &spec, "-sTCP:LISTEN"]).await;
    for pid in listeners
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
    {
        let args = stdout_of("ps", &["-o", "args=", "-p", &pid.to_string()]).await;
        if is_forward_of(args.trim(), port) {
            #[cfg(unix)]
            crate::signal::signal_process(pid, libc::SIGTERM);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_forward_of;

    #[test]
    fn only_a_kubectl_forward_of_the_port_matches() {
        assert!(is_forward_of(
            "kubectl port-forward -n dev pod/db-0 15432:5432",
            15432
        ));
        assert!(is_forward_of(
            "/usr/local/bin/kubectl port-forward pod/db 15432:5432",
            15432
        ));
        for other in [
            "kubectl port-forward -n dev pod/db-0 115432:5432",
            "kubectl port-forward -n dev pod/db-0 15433:5432",
            "kubectl get pods 15432:5432",
            "cargo test --locked",
            "bash scripts/ci-deadline.sh 180 cargo-test-run.log cargo test --locked",
            "/home/runner/work/warpforge/target/debug/deps/warpforge-0123 --test-threads=4",
            "sh -c kubectl port-forward pod/db 15432:5432",
            "",
        ] {
            assert!(!is_forward_of(other, 15432), "{other}");
        }
    }
}
