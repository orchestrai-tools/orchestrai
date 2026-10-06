use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon};
use crate::daemon::diff;

impl Daemon {
    /// Stash ops rewrite the worktree — each resolves its checkout here and
    /// runs off the loop (ADR 0002).
    pub(crate) async fn handle_stash_command(&mut self, cmd: Command) {
        match cmd {
            Command::StashPush {
                scope,
                message,
                paths,
                reply,
            } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stash_push(&p, &message, paths.as_deref()).await },
                reply,
            ),
            Command::StashList { scope, reply } => {
                let repo = self.scope_repo_path(&scope);
                tokio::spawn(async move {
                    let entries = match repo {
                        Some(p) => diff::stash_list(&p).await.unwrap_or_default(),
                        None => Vec::new(),
                    };
                    let _ = reply.send(wire::StashList { entries });
                });
            }
            Command::StashGet { scope, id, reply } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stash_get(&p, &id).await },
                reply,
            ),
            Command::StashApply {
                scope,
                id,
                pop,
                reply,
            } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stash_apply(&p, &id, pop).await },
                reply,
            ),
            Command::StashFile {
                scope,
                id,
                paths,
                reply,
            } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stash_checkout_file(&p, &id, &paths).await },
                reply,
            ),
            Command::StashDrop { scope, id, reply } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stash_drop(&p, &id).await },
                reply,
            ),

            other => self.handle_files_command(other).await,
        }
    }
}
