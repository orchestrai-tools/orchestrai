use std::collections::HashMap;

use anyhow::Result;
use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::task::{Task, TaskStatus};

/// Tracks unresolved permission requests per task. Keyed by task_id (not
/// session_id) because Command::SessionPermission and AcpUpdate::PermissionRequest
/// both use task_id as the correlation key, and sessions are keyed by task_id.
#[derive(Default)]
pub(crate) struct PendingPermissions {
    /// Task id → request id → the outcomes the request offered.
    pub(crate) by_task: HashMap<String, HashMap<String, Vec<String>>>,
    /// The outcome that won for requests no longer pending, so a stale answer
    /// can be told what already happened instead of silently rewriting it.
    /// Cleared with the task.
    resolved: HashMap<String, HashMap<String, String>>,
    /// Requests the daemon raised itself (`user_ask.rs`), by request id: the
    /// answer goes to this waiter instead of to an agent.
    pub(crate) daemon_asks: HashMap<String, tokio::sync::oneshot::Sender<String>>,
}

/// Why a permission answer was refused. Answers are first-writer-wins.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PermissionAnswerError {
    /// The request was already answered; `outcome` is what won, when known.
    AlreadyResolved { outcome: Option<String> },
    /// The request is still pending but did not offer this outcome.
    NotOffered { offered: Vec<String> },
}

impl PendingPermissions {
    /// Track a request until it is answered or its session ends.
    /// @param task_id the task whose session asked
    /// @param request_id the request's id
    /// @param options the outcomes the request offers
    pub(crate) fn record(&mut self, task_id: &str, request_id: &str, options: &[String]) {
        self.by_task
            .entry(task_id.to_string())
            .or_default()
            .insert(request_id.to_string(), options.to_vec());
    }

    /// Resolve a request. Nothing changes unless this answer wins.
    /// @param task_id the task whose session asked
    /// @param request_id the request being answered
    /// @param outcome the outcome picked
    /// @returns `Ok` when this answer won; `Err` when the request is no longer
    ///   pending or did not offer `outcome`
    pub(crate) fn resolve(
        &mut self,
        task_id: &str,
        request_id: &str,
        outcome: &str,
    ) -> Result<(), PermissionAnswerError> {
        let offered = self
            .by_task
            .get(task_id)
            .and_then(|requests| requests.get(request_id));
        if let Some(offered) = offered.filter(|offered| !offered.iter().any(|o| o == outcome)) {
            return Err(PermissionAnswerError::NotOffered {
                offered: offered.clone(),
            });
        }
        let won = self
            .by_task
            .get_mut(task_id)
            .is_some_and(|requests| requests.remove(request_id).is_some());
        if !won {
            return Err(PermissionAnswerError::AlreadyResolved {
                outcome: self
                    .resolved
                    .get(task_id)
                    .and_then(|by_request| by_request.get(request_id))
                    .cloned(),
            });
        }
        if self.by_task.get(task_id).is_some_and(HashMap::is_empty) {
            self.by_task.remove(task_id);
        }
        self.resolved
            .entry(task_id.to_string())
            .or_default()
            .insert(request_id.to_string(), outcome.to_string());
        Ok(())
    }

    /// Forget a task's requests, answered or not.
    /// @param task_id the task whose session ended
    /// @returns the ids of the requests that were still pending
    pub(crate) fn cleanup_task(&mut self, task_id: &str) -> Vec<String> {
        self.resolved.remove(task_id);
        let pending: Vec<String> = self
            .by_task
            .remove(task_id)
            .map(|requests| requests.into_keys().collect())
            .unwrap_or_default();
        for request_id in &pending {
            self.daemon_asks.remove(request_id);
        }
        pending
    }

    pub(crate) fn has_pending(&self, task_id: &str) -> bool {
        self.by_task.get(task_id).is_some_and(|r| !r.is_empty())
    }
}

impl Daemon {
    /// Drop a task's permission requests when its session ends. Each one still
    /// pending is recorded as cancelled, so clients withdraw its prompt and
    /// banner instead of offering answers nothing will receive.
    /// @param task_id the task whose session ended
    pub(crate) fn drop_pending_permissions(&mut self, task_id: &str) {
        for request_id in self.pending_permissions.cleanup_task(task_id) {
            self.emit_session(
                task_id,
                wire::SessionUpdate::PermissionResolved {
                    request_id,
                    outcome: "cancelled".to_string(),
                },
            );
        }
    }
}

/// Lifecycle state transitions for settle/snooze visibility overlay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LifecycleAction {
    Settle,
    Unsettle,
    Snooze { until: u64 },
    Unsnooze,
}

/// Pure lifecycle transition function. Returns:
/// - Err for validation failures (running, pending permission, invalid until)
/// - Ok(None) for true no-ops (task already in target state)
/// - Ok(Some(task)) when changes were made (caller must persist/emit)
pub(crate) fn apply_lifecycle_action(
    task: &Task,
    has_pending: bool,
    now: u64,
    action: LifecycleAction,
) -> Result<Option<Task>, String> {
    match action {
        LifecycleAction::Settle => {
            if task.status == TaskStatus::Running {
                return Err(format!("task {} is running", task.id));
            }
            if has_pending {
                return Err(format!("task {} has pending permission request", task.id));
            }
            // Check if already in target state
            let already_settled = task.settled_override == Some(true)
                && task.settled_at.is_some()
                && task.snoozed_until.is_none()
                && task.snoozed_at.is_none();
            if already_settled {
                return Ok(None);
            }
            let mut updated = task.clone();
            updated.settled_override = Some(true);
            // Preserve existing settled_at only when already settled (override=true)
            // Otherwise replace stale timestamp with now
            updated.settled_at = match task.settled_override {
                Some(true) => Some(task.settled_at.unwrap_or(now)),
                _ => Some(now),
            };
            // Clear snooze
            updated.snoozed_until = None;
            updated.snoozed_at = None;
            updated.updated_at = now;
            Ok(Some(updated))
        }
        LifecycleAction::Unsettle => {
            // Check if already in target state
            let already_unsettled = task.settled_override == Some(false)
                && task.settled_at.is_none()
                && task.snoozed_until.is_none()
                && task.snoozed_at.is_none();
            if already_unsettled {
                return Ok(None);
            }
            let mut updated = task.clone();
            updated.settled_override = Some(false);
            updated.settled_at = None;
            updated.snoozed_until = None;
            updated.snoozed_at = None;
            updated.updated_at = now;
            Ok(Some(updated))
        }
        LifecycleAction::Snooze { until } => {
            if until <= now {
                return Err("snooze until must be in the future".to_string());
            }
            if has_pending {
                return Err(format!("task {} has pending permission request", task.id));
            }
            // Check if already in target state
            let already_snoozed = task.snoozed_until == Some(until)
                && task.snoozed_at.is_some()
                && task.settled_override == Some(false)
                && task.settled_at.is_none();
            if already_snoozed {
                return Ok(None);
            }
            let mut updated = task.clone();
            updated.snoozed_until = Some(until);
            // Preserve snoozed_at only when same until AND Some; otherwise set now
            updated.snoozed_at = if task.snoozed_until == Some(until) && task.snoozed_at.is_some() {
                task.snoozed_at
            } else {
                Some(now)
            };
            updated.settled_override = Some(false);
            updated.settled_at = None;
            updated.updated_at = now;
            Ok(Some(updated))
        }
        LifecycleAction::Unsnooze => {
            // Check if already in target state
            if task.snoozed_until.is_none() && task.snoozed_at.is_none() {
                return Ok(None);
            }
            let mut updated = task.clone();
            updated.snoozed_until = None;
            updated.snoozed_at = None;
            updated.updated_at = now;
            Ok(Some(updated))
        }
    }
}
