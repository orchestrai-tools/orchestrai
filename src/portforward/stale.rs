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

/// The listeners on `port` as (pid, command line).
async fn listeners(port: u16) -> Vec<(u32, String)> {
    let spec = format!("-iTCP:{port}");
    let pids = stdout_of("lsof", &["-nP", "-t", &spec, "-sTCP:LISTEN"]).await;
    let mut out = Vec::new();
    for pid in pids.lines().filter_map(|l| l.trim().parse::<u32>().ok()) {
        let args = stdout_of("ps", &["-o", "args=", "-p", &pid.to_string()]).await;
        out.push((pid, args.trim().to_string()));
    }
    out
}

/// SIGTERM the stale `kubectl port-forward` listening on `port`, if any.
///
/// @param port the local port a new forward needs
pub(super) async fn kill_stale_port_forward(port: u16) {
    for (pid, args) in listeners(port).await {
        if is_forward_of(&args, port) {
            #[cfg(unix)]
            crate::signal::signal_process(pid, libc::SIGTERM);
        }
    }
}

/// Why a forward of `port` cannot start when a listener that is not a
/// `kubectl port-forward` of that port holds it.
///
/// @param port the forward's local port
/// @param holders the command lines of the port's listeners
/// @returns the failure reason, or `None` when every holder is a stale forward
pub(super) fn foreign_holder_reason(port: u16, holders: &[String]) -> Option<String> {
    holders.iter().any(|args| !is_forward_of(args, port)).then(|| {
        format!(
            "port {port} is already served by another process (not a port-forward) — forward not started; stop that process or change localPort"
        )
    })
}

/// [`foreign_holder_reason`] for the live listeners on `port`.
pub(super) async fn foreign_holder(port: u16) -> Option<String> {
    let holders: Vec<String> = listeners(port).await.into_iter().map(|(_, a)| a).collect();
    foreign_holder_reason(port, &holders)
}

#[cfg(test)]
mod tests {
    use super::{foreign_holder_reason, is_forward_of};

    fn holders(args: &[&str]) -> Vec<String> {
        args.iter().map(|a| a.to_string()).collect()
    }

    #[test]
    fn a_non_kubectl_holder_fails_the_forward_with_a_reason() {
        let reason = foreign_holder_reason(6379, &holders(&["redis-server *:6379"])).unwrap();
        assert!(reason.contains("port 6379 is already served by another process"));
        assert!(reason.contains("change localPort"));
        let mixed = holders(&["kubectl port-forward pod/r 6379:6379", "redis-server"]);
        assert!(foreign_holder_reason(6379, &mixed).is_some());
        let other_port = holders(&["kubectl port-forward pod/r 6380:6379"]);
        assert!(foreign_holder_reason(6379, &other_port).is_some());
    }

    #[test]
    fn a_stale_kubectl_forward_is_left_to_the_reclaim_path() {
        let stale = holders(&["kubectl port-forward -n dev pod/r 6379:6379"]);
        assert_eq!(foreign_holder_reason(6379, &stale), None);
        assert_eq!(foreign_holder_reason(6379, &[]), None);
    }

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
