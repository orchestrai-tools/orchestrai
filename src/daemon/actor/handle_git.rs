use anyhow::Result;
use tokio::sync::oneshot;

use warpforge_protocol as wire;

use crate::daemon::actor::event::op_result_or_dropped;
use crate::daemon::actor::{Command, DaemonHandle, RepoScope};

impl DaemonHandle {
    pub async fn git_last_commit_message(&self, scope: RepoScope) -> Result<String, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitLastCommitMessage { scope, reply: tx })
            .await;
        rx.await.unwrap_or_else(|_| Err("daemon stopped".into()))
    }

    pub async fn git_commit(
        &self,
        scope: RepoScope,
        message: &str,
        files: Option<Vec<String>>,
        amend: bool,
    ) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitCommit {
            scope,
            message: message.to_string(),
            files,
            amend,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the commit request".into()))
    }

    pub async fn git_update(&self, scope: RepoScope) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitUpdate { scope, reply: tx }).await;
        rx.await.unwrap_or_else(|_| wire::GitOpResult {
            status: wire::GitOpStatus::Error,
            message: "daemon dropped the update request".into(),
            conflicts: Vec::new(),
            branch: None,
        })
    }

    pub async fn git_branches(
        &self,
        task_id: Option<String>,
        project: Option<String>,
    ) -> wire::GitBranchList {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitBranches {
            task_id,
            project,
            reply: tx,
        })
        .await;
        rx.await.unwrap_or_default()
    }

    pub async fn git_roots(
        &self,
        task_id: Option<String>,
        project: Option<String>,
    ) -> wire::GitRoots {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitRoots {
            task_id,
            project,
            reply: tx,
        })
        .await;
        rx.await.unwrap_or_default()
    }

    pub async fn git_ignored_files(
        &self,
        task_id: Option<String>,
        project: Option<String>,
    ) -> wire::GitIgnoredFiles {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitIgnored {
            task_id,
            project,
            reply: tx,
        })
        .await;
        rx.await.unwrap_or_default()
    }

    pub async fn git_add(&self, scope: RepoScope, paths: Vec<String>) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitAdd {
            scope,
            paths,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the add request".into()))
    }

    pub async fn git_ignore_paths(
        &self,
        scope: RepoScope,
        paths: Vec<String>,
    ) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitIgnorePaths {
            scope,
            paths,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the ignore request".into()))
    }

    pub async fn shelf_list(&self, scope: RepoScope) -> wire::ShelfList {
        let (tx, rx) = oneshot::channel();
        self.send(Command::ShelfList { scope, reply: tx }).await;
        rx.await.unwrap_or_default()
    }

    pub async fn shelf_create(
        &self,
        scope: RepoScope,
        name: String,
        paths: Option<Vec<String>>,
    ) -> Result<wire::ShelfEntry, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::ShelfCreate {
            scope,
            name,
            paths,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the shelve request".into()))
    }

    pub async fn shelf_get(&self, scope: RepoScope, id: &str) -> Result<wire::ShelfDiff, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::ShelfGet {
            scope,
            id: id.to_string(),
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the shelf read request".into()))
    }

    pub async fn shelf_apply(&self, scope: RepoScope, id: &str, drop: bool) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::ShelfApply {
            scope,
            id: id.to_string(),
            drop,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the unshelve request".into()))
    }

    pub async fn shelf_drop(&self, scope: RepoScope, id: &str) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::ShelfDrop {
            scope,
            id: id.to_string(),
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the shelf delete request".into()))
    }

    pub async fn stash_list(&self, scope: RepoScope) -> wire::StashList {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashList { scope, reply: tx }).await;
        rx.await.unwrap_or_default()
    }

    pub async fn stash_push(
        &self,
        scope: RepoScope,
        message: String,
        paths: Option<Vec<String>>,
    ) -> Result<wire::StashEntry, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashPush {
            scope,
            message,
            paths,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the stash request".into()))
    }

    pub async fn stash_get(&self, scope: RepoScope, id: &str) -> Result<wire::StashDiff, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashGet {
            scope,
            id: id.to_string(),
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the stash read request".into()))
    }

    pub async fn stash_apply(&self, scope: RepoScope, id: &str, pop: bool) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashApply {
            scope,
            id: id.to_string(),
            pop,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the stash apply request".into()))
    }

    pub async fn stash_checkout_file(
        &self,
        scope: RepoScope,
        id: &str,
        paths: Vec<String>,
    ) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashFile {
            scope,
            id: id.to_string(),
            paths,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the stash restore request".into()))
    }

    pub async fn stash_drop(&self, scope: RepoScope, id: &str) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::StashDrop {
            scope,
            id: id.to_string(),
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the stash delete request".into()))
    }

    pub async fn git_switch_branch(&self, scope: RepoScope, branch: &str) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitSwitchBranch {
            scope,
            branch: branch.to_string(),
            reply: tx,
        })
        .await;
        rx.await.unwrap_or_else(|_| wire::GitOpResult {
            status: wire::GitOpStatus::Error,
            message: "daemon dropped the switch request".into(),
            conflicts: Vec::new(),
            branch: None,
        })
    }

    pub async fn git_branch_rename(
        &self,
        scope: RepoScope,
        branch: &str,
        new_name: &str,
    ) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitBranchRename {
            scope,
            branch: branch.to_string(),
            new_name: new_name.to_string(),
            reply: tx,
        })
        .await;
        op_result_or_dropped(rx.await, "daemon dropped the rename request")
    }

    pub async fn git_branch_delete(
        &self,
        scope: RepoScope,
        branch: &str,
        force: bool,
    ) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitBranchDelete {
            scope,
            branch: branch.to_string(),
            force,
            reply: tx,
        })
        .await;
        op_result_or_dropped(rx.await, "daemon dropped the delete request")
    }

    pub async fn git_rebase(
        &self,
        scope: RepoScope,
        branch: &str,
        target: &str,
    ) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitRebase {
            scope,
            branch: branch.to_string(),
            target: target.to_string(),
            reply: tx,
        })
        .await;
        op_result_or_dropped(rx.await, "daemon dropped the rebase request")
    }

    pub async fn git_branch_create(
        &self,
        scope: RepoScope,
        name: &str,
        from: Option<String>,
        checkout: bool,
        overwrite: bool,
    ) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitBranchCreate {
            scope,
            name: name.to_string(),
            from,
            checkout,
            overwrite,
            reply: tx,
        })
        .await;
        op_result_or_dropped(rx.await, "daemon dropped the create-branch request")
    }

    pub async fn git_merge(&self, scope: RepoScope, target: &str) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitMerge {
            scope,
            target: target.to_string(),
            reply: tx,
        })
        .await;
        op_result_or_dropped(rx.await, "daemon dropped the merge request")
    }

    pub async fn git_push_info(&self, scope: RepoScope) -> Result<wire::GitPushInfo, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitPushInfo { scope, reply: tx }).await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the push preview request".into()))
    }

    pub async fn git_push(&self, scope: RepoScope, force: bool) -> wire::GitOpResult {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitPush {
            scope,
            force,
            reply: tx,
        })
        .await;
        rx.await.unwrap_or_else(|_| wire::GitOpResult {
            status: wire::GitOpStatus::Error,
            message: "daemon dropped the push request".into(),
            conflicts: Vec::new(),
            branch: None,
        })
    }

    pub async fn git_create_pr(
        &self,
        task_id: &str,
        title: String,
        body: String,
        base: Option<String>,
    ) -> Result<String, String> {
        let (tx, rx) = oneshot::channel();
        self.send(Command::GitCreatePr {
            task_id: task_id.to_string(),
            title,
            body,
            base,
            reply: tx,
        })
        .await;
        rx.await
            .unwrap_or_else(|_| Err("daemon dropped the create-PR request".into()))
    }
}
