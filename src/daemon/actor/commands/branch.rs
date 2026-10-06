use crate::daemon::actor::{Command, Daemon};
use crate::daemon::diff;

impl Daemon {
    /// Branch ops rewrite the working tree: each resolves its checkout here
    /// and runs off the loop through `spawn_git_op` (ADR 0002).
    pub(crate) async fn handle_branch_command(&mut self, cmd: Command) {
        match cmd {
            Command::GitSwitchBranch {
                scope,
                branch,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::switch_branch(&p, &branch).await },
                reply,
            ),
            Command::GitBranchRename {
                scope,
                branch,
                new_name,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::rename_branch(&p, &branch, &new_name).await },
                reply,
            ),
            Command::GitBranchDelete {
                scope,
                branch,
                force,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::delete_branch(&p, &branch, force).await },
                reply,
            ),
            Command::GitBranchCreate {
                scope,
                name,
                from,
                checkout,
                overwrite,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move {
                    diff::branch_create(&p, &name, from.as_deref(), checkout, overwrite).await
                },
                reply,
            ),
            Command::GitRebase {
                scope,
                branch,
                target,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::rebase(&p, &branch, &target).await },
                reply,
            ),
            Command::GitMerge {
                scope,
                target,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::merge(&p, &target).await },
                reply,
            ),

            other => self.handle_shelf_command(other).await,
        }
    }
}
