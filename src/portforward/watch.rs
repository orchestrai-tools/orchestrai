//! The per-forward watcher task: resolves the pod, runs `kubectl port-forward`,
//! and reconnects with backoff until stopped or out of retries.

use futures::FutureExt;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Notify};

use super::stale::{foreign_holder, kill_stale_port_forward};
use super::PfEvent;

#[allow(clippy::too_many_arguments)]
pub(super) async fn watch_portforward(
    project: String,
    name: String,
    namespace: String,
    pod_prefix: String,
    local_port: u16,
    remote_port: u16,
    event_tx: mpsc::UnboundedSender<PfEvent>,
    stop: Arc<Notify>,
) {
    let mut connected_once = false;
    let mut reconnect_delay = 2000u64;
    let mut consecutive_failures = 0u32;
    const MAX_CONSECUTIVE_FAILURES: u32 = 15;

    loop {
        if stop.notified().now_or_never().is_some() {
            return;
        }

        // Check if port is already active
        if is_port_active(local_port).await {
            if connected_once {
                // Port active and we were connected — just wait and recheck
                consecutive_failures = 0;
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(2)) => {}
                    _ = stop.notified() => return,
                }
                continue;
            }

            if let Some(reason) = foreign_holder(local_port).await {
                let _ = event_tx.send(PfEvent::Failed {
                    project: project.clone(),
                    name: name.clone(),
                    local_port,
                    reason,
                });
                return;
            }
            let _ = event_tx.send(PfEvent::Log {
                project: project.clone(),
                name: name.clone(),
                line: format!("Port {local_port} already in use, reclaiming stale port-forward"),
            });
            kill_stale_port_forward(local_port).await;
            if !wait_for_port_released(local_port, &stop).await {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    let _ = event_tx.send(PfEvent::Failed {
                        project: project.clone(),
                        name: name.clone(),
                        local_port,
                        reason: busy_port_reason(local_port),
                    });
                    return;
                }
                let _ = event_tx.send(PfEvent::Log {
                    project: project.clone(),
                    name: name.clone(),
                    line: format!("Port {local_port} still in use (failure {consecutive_failures}/{MAX_CONSECUTIVE_FAILURES}), retry in {reconnect_delay}ms"),
                });
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(reconnect_delay)) => {}
                    _ = stop.notified() => return,
                }
                reconnect_delay = next_reconnect_delay(reconnect_delay);
                continue;
            }
        }

        if connected_once {
            let _ = event_tx.send(PfEvent::Log {
                project: project.clone(),
                name: name.clone(),
                line: "Connection lost, reconnecting".to_string(),
            });
        }

        // Resolve pod name
        let pod = match resolve_pod(&project, &namespace, &pod_prefix, &name, &event_tx).await {
            Some(p) => p,
            None => {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    let _ = event_tx.send(PfEvent::Failed {
                        project: project.clone(),
                        name: name.clone(),
                        local_port,
                        reason: format!(
                            "no pod matching '{pod_prefix}' in namespace '{namespace}'"
                        ),
                    });
                    return;
                }
                let _ = event_tx.send(PfEvent::Log {
                    project: project.clone(),
                    name: name.clone(),
                    line: format!("No pod matching '{pod_prefix}' in namespace '{namespace}' (failure {consecutive_failures}/{MAX_CONSECUTIVE_FAILURES}), retry in 3s"),
                });
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(3)) => {}
                    _ = stop.notified() => return,
                }
                continue;
            }
        };

        let _ = event_tx.send(PfEvent::Log {
            project: project.clone(),
            name: name.clone(),
            line: format!("kubectl port-forward pod/{pod} {local_port}:{remote_port}"),
        });

        let port_arg = format!("{local_port}:{remote_port}");
        let mut child = match Command::new("kubectl")
            .args([
                "port-forward",
                "-n",
                &namespace,
                &format!("pod/{pod}"),
                &port_arg,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    let _ = event_tx.send(PfEvent::Failed {
                        project: project.clone(),
                        name: name.clone(),
                        local_port,
                        reason: format!("could not run kubectl: {e}"),
                    });
                    return;
                }
                let _ = event_tx.send(PfEvent::Log {
                    project: project.clone(),
                    name: name.clone(),
                    line: format!("Failed to spawn kubectl: {e} (failure {consecutive_failures}/{MAX_CONSECUTIVE_FAILURES})"),
                });
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(reconnect_delay)) => {}
                    _ = stop.notified() => return,
                }
                reconnect_delay = next_reconnect_delay(reconnect_delay);
                continue;
            }
        };

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let tx = event_tx.clone();
            let n = name.clone();
            let pr = project.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send(PfEvent::Log {
                        project: pr.clone(),
                        name: n.clone(),
                        line,
                    });
                }
            });
        }

        // Stream stderr (filter benign errors)
        if let Some(stderr) = child.stderr.take() {
            let tx = event_tx.clone();
            let n = name.clone();
            let pr = project.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if !is_benign_forward_error(&line) {
                        let _ = tx.send(PfEvent::Log {
                            project: pr.clone(),
                            name: n.clone(),
                            line: format!("[err] {line}"),
                        });
                    }
                }
            });
        }

        // Wait for port to actually become active
        if wait_for_port_active(local_port, &stop).await {
            let _ = event_tx.send(PfEvent::Log {
                project: project.clone(),
                name: name.clone(),
                line: format!("localhost:{local_port} → pod/{pod}:{remote_port}"),
            });

            if !connected_once {
                let _ = event_tx.send(PfEvent::Active {
                    project: project.clone(),
                    name: name.clone(),
                    local_port,
                });
            } else {
                let _ = event_tx.send(PfEvent::Restarted {
                    project: project.clone(),
                    name: name.clone(),
                    local_port,
                });
            }

            connected_once = true;
            consecutive_failures = 0;
            reconnect_delay = 2000;

            // Wait for child to exit or stop signal
            tokio::select! {
                _ = child.wait() => {
                    // Child exited, will reconnect
                }
                _ = stop.notified() => {
                    let _ = child.start_kill();
                    return;
                }
            }
        } else {
            // Port never became active
            let _ = child.start_kill();
            consecutive_failures += 1;
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                let _ = event_tx.send(PfEvent::Log {
                    project: project.clone(),
                    name: name.clone(),
                    line: format!(
                        "Failed to connect after {MAX_CONSECUTIVE_FAILURES} attempts, giving up"
                    ),
                });
                let _ = event_tx.send(PfEvent::Failed {
                    project: project.clone(),
                    name: name.clone(),
                    local_port,
                    reason: format!("kubectl never opened port {local_port}"),
                });
                return;
            }
            let _ = event_tx.send(PfEvent::Log {
                project: project.clone(),
                name: name.clone(),
                line: format!("Failed to connect (failure {consecutive_failures}/{MAX_CONSECUTIVE_FAILURES}), retry in {reconnect_delay}ms"),
            });
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(reconnect_delay)) => {}
                _ = stop.notified() => return,
            }
            reconnect_delay = next_reconnect_delay(reconnect_delay);
        }
    }
}

/// The failure reason for a local port that another process keeps holding.
pub(super) fn busy_port_reason(port: u16) -> String {
    format!("port {port} is in use by another process; stop it or change this forward's localPort")
}

async fn is_port_active(port: u16) -> bool {
    Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

async fn wait_for_port_released(port: u16, stop: &Arc<Notify>) -> bool {
    for _ in 0..15 {
        if !is_port_active(port).await {
            return true;
        }
        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(200)) => {}
            _ = stop.notified() => return false,
        }
    }
    false
}

async fn wait_for_port_active(port: u16, stop: &Arc<Notify>) -> bool {
    for _ in 0..10 {
        if is_port_active(port).await {
            return true;
        }
        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(300)) => {}
            _ = stop.notified() => return false,
        }
    }
    false
}

fn is_benign_forward_error(line: &str) -> bool {
    line.contains("error copying from local connection to remote stream")
        || line.contains("error copying from remote stream to local connection")
}

fn next_reconnect_delay(current: u64) -> u64 {
    std::cmp::min(current * 2, 30000)
}

async fn resolve_pod(
    project: &str,
    namespace: &str,
    pod_prefix: &str,
    name: &str,
    event_tx: &mpsc::UnboundedSender<PfEvent>,
) -> Option<String> {
    let out = match Command::new("kubectl")
        .args(["get", "pods", "-n", namespace, "-o", "name"])
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => {
            let _ = event_tx.send(PfEvent::Log {
                project: project.to_string(),
                name: name.to_string(),
                line: format!("[error] kubectl get pods failed: {e}"),
            });
            return None;
        }
    };

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let _ = event_tx.send(PfEvent::Log {
            project: project.to_string(),
            name: name.to_string(),
            line: format!("[error] kubectl: {}", stderr.trim()),
        });
        return None;
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let pods: Vec<&str> = text
        .lines()
        .filter_map(|l| l.strip_prefix("pod/"))
        .collect();

    if pods.is_empty() {
        let _ = event_tx.send(PfEvent::Log {
            project: project.to_string(),
            name: name.to_string(),
            line: format!("[warn] No pods found in namespace '{namespace}'"),
        });
        return None;
    }

    // Exact → prefix → substring
    if pods.contains(&pod_prefix) {
        return Some(pod_prefix.to_string());
    }
    if let Some(p) = pods.iter().find(|p| p.starts_with(pod_prefix)) {
        return Some(p.to_string());
    }
    if let Some(p) = pods.iter().find(|p| p.contains(pod_prefix)) {
        return Some(p.to_string());
    }

    let _ = event_tx.send(PfEvent::Log {
        project: project.to_string(),
        name: name.to_string(),
        line: format!(
            "[warn] No pod matching '{pod_prefix}' — available: {}",
            pods.join(", ")
        ),
    });
    None
}
