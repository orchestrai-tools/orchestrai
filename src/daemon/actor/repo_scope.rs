//! Which checkout a git operation runs in: a task's worktree, or a project's
//! own checkout when no task is open (the Changes page on the main branch).

use std::future::Future;

use tokio::sync::{mpsc, oneshot};
use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon, GitEffect};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepoScope {
    Task(String),
    Project(String),
}

impl RepoScope {
    /// A non-empty `task_id` wins, so older clients that send only a task
    /// keep working; `project` alone selects the project's checkout.
    pub fn new(task_id: String, project: Option<String>) -> Self {
        match project {
            Some(name) if task_id.is_empty() => Self::Project(name),
            _ => Self::Task(task_id),
        }
    }

    pub fn task(task_id: &str) -> Self {
        Self::Task(task_id.to_string())
    }

    pub(crate) fn missing(&self) -> String {
        match self {
            Self::Task(id) => format!("no repo for task {id}"),
            Self::Project(name) => format!("no repo for project {name}"),
        }
    }

    pub(crate) fn missing_op(&self) -> wire::GitOpResult {
        op_error(self.missing())
    }

    /// Tell the actor a git op changed the tree. Only a task carries state
    /// that has to follow (its `updated_at` and change count); the project
    /// checkout is refetched by the client that ran the op.
    pub(crate) async fn finished(self, cmd_tx: &mpsc::Sender<Command>, effect: GitEffect) {
        if let Self::Task(task_id) = self {
            let _ = cmd_tx
                .send(Command::GitOpFinished { task_id, effect })
                .await;
        }
    }
}

pub(crate) fn op_error(message: String) -> wire::GitOpResult {
    wire::GitOpResult {
        status: wire::GitOpStatus::Error,
        message,
        conflicts: Vec::new(),
        branch: None,
    }
}

impl Daemon {
    pub(crate) fn scope_repo_path(&self, scope: &RepoScope) -> Option<String> {
        match scope {
            RepoScope::Task(id) => self.task_repo_path(id),
            RepoScope::Project(name) => self.project_path(name),
        }
    }

    /// Run a tree-changing git op in the scope's checkout off the loop
    /// (ADR 0002), and report a clean result back as `GitOpFinished`.
    pub(crate) fn spawn_git_op<F, Fut, E>(
        &self,
        scope: RepoScope,
        op: F,
        reply: oneshot::Sender<wire::GitOpResult>,
    ) where
        F: FnOnce(String) -> Fut + Send + 'static,
        Fut: Future<Output = Result<wire::GitOpResult, E>> + Send,
        E: std::fmt::Display,
    {
        let repo = self.scope_repo_path(&scope);
        let cmd_tx = self.cmd_tx.clone();
        tokio::spawn(async move {
            let result = match repo {
                Some(path) => op(path).await.unwrap_or_else(|e| op_error(e.to_string())),
                None => scope.missing_op(),
            };
            if result.status == wire::GitOpStatus::Ok {
                scope.finished(&cmd_tx, GitEffect::Bump).await;
            }
            let _ = reply.send(result);
        });
    }

    /// Run a git op that answers `Result<T, String>` in the scope's checkout
    /// off the loop. Nothing is reported back to the actor.
    pub(crate) fn spawn_git_call<T, F, Fut, E>(
        &self,
        scope: &RepoScope,
        op: F,
        reply: oneshot::Sender<Result<T, String>>,
    ) where
        T: Send + 'static,
        F: FnOnce(String) -> Fut + Send + 'static,
        Fut: Future<Output = Result<T, E>> + Send,
        E: std::fmt::Display,
    {
        let repo = self.scope_repo_path(scope);
        let missing = scope.missing();
        tokio::spawn(async move {
            let result = match repo {
                Some(path) => op(path).await.map_err(|e| e.to_string()),
                None => Err(missing),
            };
            let _ = reply.send(result);
        });
    }
}
