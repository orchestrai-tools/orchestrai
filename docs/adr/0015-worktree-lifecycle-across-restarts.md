# 0015 — Worktree lifecycle survives a daemon restart

**Status:** accepted (2026-09-23)

## Context

A task's isolated checkout lives under `<project>/.worktrees/<task_id>` and is
tracked by an in-memory `WorktreeManager` per project. The manager was built
lazily on first use and never rebuilt, so a daemon restart left it empty while
the tasks in the store still recorded their worktree paths. Three failures
followed: deleting such a task skipped worktree removal and orphaned the
directory (with its build output), `task.mergeWorktree` failed with "no worktree
for task", and conversation branches lost the source branch they inherit from.

Separately, worktree creation and removal were awaited inline on the actor,
which stalls every task while a large checkout is written or a GB-sized build
dir is deleted (ADR 0002). And a failed `git worktree add` was only printed to
stderr, so the task silently ran in the project checkout with no isolation and
no signal.

## Decisions

**The manager is rebuilt at boot from the persisted tasks.** Each recorded path
is cross-checked against `git worktree list --porcelain`; only paths git still
reports as worktrees of the project are adopted. The `git worktree list` call
runs synchronously in `Daemon::spawn`, before the actor loop — startup already
reads the store directly, so this is not the hot path ADR 0002 protects.

**A task loses its `worktree` only when git confirms the checkout is gone.**
When git fails (not on the app's PATH, an unmounted project, a lock), adopt and
clear nothing — one transient failure must not move every isolated task to the
main checkout. A recorded path that is unlisted but still exists on disk is left
alone too; only a path git does not list and that is also absent from disk is
cleared and persisted, so the task runs in the project checkout, the path every
consumer already handles. Nothing is deleted from disk at boot.

**A restored `base_branch` is the root checkout's branch at boot**, not
necessarily the branch the worktree was forked from — the store does not record
the fork point. Merge checks out that branch, so a merge after a restart can
target the wrong base; nothing calls merge today.

**Removal runs off the actor.** Delete resolves the git/fs inputs, drops the
manager entry immediately, and spawns the removal. Terminals are killed and the
session cancelled before removal starts, as before. The workflow merge path
already ran detached; creation now does too — the first workflow stage starts
from the `WorktreeReady` handler instead of inline.

**A failed checkout blocks the task and is surfaced.** The task's
`blocked_reason` carries the git error and its status becomes `Blocked`, which
the existing attention rail renders; sending a message then retries it in the
project checkout, prepending the task's original prompt (and its attachments,
model and overrides, held in memory until the retry). A workflow parent is
finalized with `WorkflowOutcome::Error`, which does the same. It must not fall
back to an unisolated run without telling the user.

## Invariants

1. **`daemon/worktree/` — the manager is a cache, not the source of truth.** The
   persisted `task.worktree` and `git worktree list` are. Anything that removes a
   checkout must leave both consistent (clear the field or delete the row, and
   let git drop the entry).
2. **A task with `worktree: None` always means the project checkout.** Do not
   add a third state (a path that may not exist); repair it at boot instead.
3. **Boot never deletes files, and never clears a record on a git failure.** A
   `git worktree list` that did not succeed is not evidence a checkout is gone.
4. **No git worktree work on the actor loop** (ADR 0002). Create, merge and
   remove are handed to a spawned task; the handler only edits its maps.
5. **A checkout failure is never silent.** It blocks the task or fails the
   pipeline with the git error attached.
