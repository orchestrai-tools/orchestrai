use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon, Event, GitEffect};
use crate::daemon::diff;

impl Daemon {
    pub(crate) async fn handle_git_command(&mut self, cmd: Command) {
        match cmd {
            Command::GitOpFinished { task_id, effect } => match effect {
                GitEffect::Bump => self.bump_task(&task_id),
                GitEffect::Committed => {
                    if let Some(task) = self.tasks.get_mut(&task_id) {
                        task.updated_at = crate::daemon::task::now_secs();
                        task.files_changed = 0;
                        let updated = task.clone();
                        self.persist(&updated);
                        self.emit(Event::TaskUpdated(updated));
                    }
                }
                GitEffect::HunkRejected => {
                    if let Some(task) = self.tasks.get_mut(&task_id) {
                        task.updated_at = crate::daemon::task::now_secs();
                        task.files_changed = task.files_changed.saturating_sub(1);
                        let updated = task.clone();
                        self.persist(&updated);
                        self.emit(Event::TaskUpdated(updated));
                    }
                }
            },

            Command::GitCommit {
                scope,
                message,
                files,
                amend,
                reply,
            } => {
                // git shells out; resolve the repo here and run it off the loop,
                // reporting what changed back as GitOpFinished (ADR 0002).
                let repo = self.scope_repo_path(&scope);
                let cmd_tx = self.cmd_tx.clone();
                tokio::spawn(async move {
                    let result = match repo {
                        Some(p) => diff::commit(&p, &message, files.as_deref(), amend)
                            .await
                            .map_err(|e| e.to_string()),
                        None => Err(scope.missing()),
                    };
                    if result.is_ok() {
                        scope.finished(&cmd_tx, GitEffect::Committed).await;
                    }
                    let _ = reply.send(result);
                });
            }
            Command::GitLastCommitMessage { scope, reply } => self.spawn_git_call(
                &scope,
                |p| async move { diff::last_commit_message(&p).await },
                reply,
            ),
            Command::GitUpdate { scope, reply } => self.spawn_git_op(
                scope,
                |p| async move { diff::update_project(&p).await },
                reply,
            ),
            Command::GitBranches {
                task_id,
                project,
                reply,
            } => {
                // A task pins its own project; without one, New Task passes the
                // project directly because no task exists yet.
                let repo = match task_id {
                    Some(id) => self.task_repo_path(&id),
                    None => project.as_deref().and_then(|p| self.project_path(p)),
                };
                tokio::spawn(async move {
                    let list = match repo {
                        Some(p) => diff::list_branches(&p).await.unwrap_or_default(),
                        None => wire::GitBranchList::default(),
                    };
                    let _ = reply.send(list);
                });
            }
            Command::GitRoots {
                task_id,
                project,
                reply,
            } => {
                let repo = match task_id {
                    Some(id) => self.task_repo_path(&id),
                    None => project.as_deref().and_then(|p| self.project_path(p)),
                };
                tokio::spawn(async move {
                    let roots = match repo {
                        Some(p) => diff::git_roots(&p).await.unwrap_or_default(),
                        None => Vec::new(),
                    };
                    let _ = reply.send(wire::GitRoots { roots });
                });
            }
            Command::GitIgnored {
                task_id,
                project,
                reply,
            } => {
                // One cheap `ls-files` — the toggle must not pay for a full
                // tracked+untracked recompute (nor invalidate the diff cache).
                let repo = match task_id {
                    Some(id) => self.task_repo_path(&id),
                    None => project.as_deref().and_then(|p| self.project_path(p)),
                };
                tokio::spawn(async move {
                    let res = match repo {
                        Some(p) => match diff::ignored_files(&p).await {
                            Ok((ignored, truncated)) => wire::GitIgnoredFiles {
                                ignored,
                                truncated,
                                available: true,
                            },
                            Err(_) => wire::GitIgnoredFiles {
                                ignored: Vec::new(),
                                truncated: false,
                                available: false,
                            },
                        },
                        // No repo to scan: same contract as `diff.get`'s
                        // untracked flag — nothing failed, there is nothing.
                        None => wire::GitIgnoredFiles {
                            ignored: Vec::new(),
                            truncated: false,
                            available: true,
                        },
                    };
                    let _ = reply.send(res);
                });
            }
            // "Add to VCS" stages without committing; "Add to .gitignore"
            // appends to the root .gitignore. Both off the loop (ADR 0002).
            Command::GitAdd {
                scope,
                paths,
                reply,
            } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::stage_paths(&p, &paths).await },
                reply,
            ),
            Command::GitIgnorePaths {
                scope,
                paths,
                reply,
            } => self.spawn_git_call(
                &scope,
                move |p| async move { diff::ignore_paths(&p, &paths).await },
                reply,
            ),
            Command::GitPushInfo { scope, reply } => {
                self.spawn_git_call(&scope, |p| async move { diff::push_info(&p).await }, reply)
            }
            Command::GitPush {
                scope,
                force,
                reply,
            } => self.spawn_git_op(
                scope,
                move |p| async move { diff::push(&p, force).await },
                reply,
            ),
            Command::GitCreatePr {
                task_id,
                title,
                body,
                base,
                reply,
            } => {
                let repo = self.tasks.get(&task_id).and_then(|task| {
                    task.worktree
                        .clone()
                        .or_else(|| self.project_path(&task.project))
                });
                // Creating a PR shells out to the forge's CLI over the network;
                // it changes nothing the actor holds, so it just answers from a
                // task of its own (ADR 0002).
                tokio::spawn(async move {
                    let result = match repo {
                        Some(path) => diff::create_pr(&path, &title, &body, base.as_deref())
                            .await
                            .map_err(|e| e.to_string()),
                        None => Err(format!("no repo for task {task_id}")),
                    };
                    let _ = reply.send(result);
                });
            }

            other => self.handle_branch_command(other).await,
        }
    }
}
