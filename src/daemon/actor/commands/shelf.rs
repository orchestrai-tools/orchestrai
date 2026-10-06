use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon};
use crate::daemon::diff;

fn daemon_home() -> std::path::PathBuf {
    crate::registry::data_dir()
}

impl Daemon {
    /// Shelving rewrites the worktree — each op resolves its checkout here
    /// and runs off the loop (ADR 0002).
    pub(crate) async fn handle_shelf_command(&mut self, cmd: Command) {
        match cmd {
            Command::ShelfList { scope, reply } => {
                let repo = self.scope_repo_path(&scope);
                let home = daemon_home();
                tokio::spawn(async move {
                    let entries = match repo {
                        Some(p) => diff::shelf_list(&home, &p).await,
                        None => Vec::new(),
                    };
                    let _ = reply.send(wire::ShelfList { entries });
                });
            }
            Command::ShelfCreate {
                scope,
                name,
                paths,
                reply,
            } => {
                let home = daemon_home();
                self.spawn_git_call(
                    &scope,
                    move |p| async move {
                        diff::shelf_create(&home, &p, &name, paths.as_deref()).await
                    },
                    reply,
                );
            }
            Command::ShelfGet { scope, id, reply } => {
                let home = daemon_home();
                self.spawn_git_call(
                    &scope,
                    move |p| async move { diff::shelf_get(&home, &p, &id).await },
                    reply,
                );
            }
            Command::ShelfApply {
                scope,
                id,
                drop,
                reply,
            } => {
                let home = daemon_home();
                self.spawn_git_call(
                    &scope,
                    move |p| async move { diff::shelf_apply(&home, &p, &id, drop).await },
                    reply,
                );
            }
            Command::ShelfDrop { scope, id, reply } => {
                let home = daemon_home();
                self.spawn_git_call(
                    &scope,
                    move |p| async move { diff::shelf_drop(&home, &p, &id).await },
                    reply,
                );
            }

            other => self.handle_stash_command(other).await,
        }
    }
}
