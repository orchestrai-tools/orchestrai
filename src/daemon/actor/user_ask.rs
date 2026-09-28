//! Permission prompts the daemon raises itself, on a task's chat, through the
//! same request/answer flow as an agent's own permission requests. The answer
//! goes back to the daemon code that asked instead of to the agent.

use tokio::sync::oneshot;
use uuid::Uuid;
use warpforge_protocol as wire;

use crate::daemon::actor::lifecycle::PendingPermissions;
use crate::daemon::actor::{Command, Daemon, DaemonHandle};

/// The outcomes a daemon prompt offers.
const OPTIONS: [&str; 3] = ["allow", "allow_always", "deny"];

/// A prompt waiting on the user.
pub(crate) struct UserAsk {
    pub(crate) request_id: String,
    /// Resolves with the outcome picked; errors when the prompt is dropped
    /// with its task's session.
    pub(crate) answer: oneshot::Receiver<String>,
}

impl DaemonHandle {
    /// Ask the user on `task_id`'s chat, offering allow, allow always and deny.
    /// @param task_id the task whose chat shows the prompt
    /// @param title the question
    /// @returns the pending prompt, or why it cannot be shown
    pub(crate) async fn ask_user(&self, task_id: &str, title: &str) -> Result<UserAsk, String> {
        let (reply, rx) = oneshot::channel();
        self.send(Command::AskUser {
            task_id: task_id.into(),
            title: title.into(),
            reply,
        })
        .await;
        rx.await.unwrap_or_else(|_| Err("daemon stopped".into()))
    }

    /// Take back a prompt nobody answered; clients show it as cancelled.
    /// @param task_id the task whose chat shows the prompt
    /// @param request_id the prompt's id
    pub(crate) async fn withdraw_ask(&self, task_id: &str, request_id: &str) {
        self.send(Command::WithdrawAsk {
            task_id: task_id.into(),
            request_id: request_id.into(),
        })
        .await;
    }
}

impl PendingPermissions {
    /// Hand an answer to the daemon code waiting on it.
    /// @param request_id the answered request
    /// @param outcome the outcome picked
    /// @returns false when the request was an agent's, not the daemon's
    pub(crate) fn answer_daemon_ask(&mut self, request_id: &str, outcome: &str) -> bool {
        match self.daemon_asks.remove(request_id) {
            Some(waiter) => {
                let _ = waiter.send(outcome.to_string());
                true
            }
            None => false,
        }
    }
}

impl Daemon {
    pub(crate) fn ask_user(
        &mut self,
        task_id: String,
        title: String,
        reply: oneshot::Sender<Result<UserAsk, String>>,
    ) {
        if !self.tasks.contains_key(&task_id) {
            let _ = reply.send(Err(format!("no task '{task_id}' to ask on")));
            return;
        }
        if !self.sessions.contains_key(&task_id) {
            let _ = reply.send(Err(format!(
                "task '{task_id}' has no running agent session to ask on"
            )));
            return;
        }
        let request_id = format!("{task_id}:daemon:{}", Uuid::new_v4().simple());
        let options: Vec<String> = OPTIONS.iter().map(|o| o.to_string()).collect();
        let (waiter, answer) = oneshot::channel();
        self.pending_permissions
            .record(&task_id, &request_id, &options);
        self.pending_permissions
            .daemon_asks
            .insert(request_id.clone(), waiter);
        self.emit_session(
            &task_id,
            wire::SessionUpdate::PermissionRequest {
                request_id: request_id.clone(),
                title,
                options,
                tool_call_id: None,
            },
        );
        let _ = reply.send(Ok(UserAsk { request_id, answer }));
    }

    pub(crate) fn withdraw_ask(&mut self, task_id: String, request_id: String) {
        self.pending_permissions.daemon_asks.remove(&request_id);
        let removed = self
            .pending_permissions
            .by_task
            .get_mut(&task_id)
            .is_some_and(|requests| requests.remove(&request_id).is_some());
        if !removed {
            return;
        }
        if self
            .pending_permissions
            .by_task
            .get(&task_id)
            .is_some_and(|requests| requests.is_empty())
        {
            self.pending_permissions.by_task.remove(&task_id);
        }
        self.emit_session(
            &task_id,
            wire::SessionUpdate::PermissionResolved {
                request_id,
                outcome: "cancelled".into(),
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_daemon_ask_takes_the_answer_and_an_agent_request_does_not() {
        let mut pending = PendingPermissions::default();
        let (tx, mut rx) = oneshot::channel();
        pending.record("t1", "t1:daemon:a", &["allow".into()]);
        pending.daemon_asks.insert("t1:daemon:a".into(), tx);

        assert!(!pending.answer_daemon_ask("t1:agent:b", "allow"));
        assert!(pending.answer_daemon_ask("t1:daemon:a", "allow"));
        assert_eq!(rx.try_recv().unwrap(), "allow");
        assert!(!pending.answer_daemon_ask("t1:daemon:a", "deny"));
    }

    #[test]
    fn ending_a_task_drops_its_daemon_asks() {
        let mut pending = PendingPermissions::default();
        let (tx, mut rx) = oneshot::channel::<String>();
        pending.record("t1", "t1:daemon:a", &["allow".into()]);
        pending.daemon_asks.insert("t1:daemon:a".into(), tx);

        assert_eq!(pending.cleanup_task("t1"), vec!["t1:daemon:a".to_string()]);
        assert!(pending.daemon_asks.is_empty());
        assert!(rx.try_recv().is_err());
    }
}
