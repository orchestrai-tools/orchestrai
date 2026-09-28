# 0020 — A worktree task's pull request is a daemon cache, pushed as it changes

**Status:** accepted (2026-09-28)

## Context

Opening a pull request from the push dialog ended with a toast and a browser
tab; afterwards nothing in the app said the task had one, whether its checks
passed, or that it had merged and the worktree could go. The sidebar row and
the task header are where that answer belongs, and both need it for many tasks
at once without costing a GitHub round trip per render.

## Decisions

**The state lives in `daemon/pull_status`, beside the actor, not in it.**
`PullWatch` hangs off `DaemonHandle`; it is a map from task id to the pull
request of that task's worktree branch. Fetches are spawned tasks running one
`gh pr list --head <branch> --state all --json …` (including `headRefOid`) in the worktree, at most four
at once. The actor is only asked for the task list. *Rejected:* a field on
`TaskInfo` — the value is derived from GitHub, not owned by the task, and
routing it through the actor would persist and re-broadcast whole tasks for a
checks flip.

**Clients get it pushed.** `task.pullRequests` answers with the cache at once
and re-checks, in the background, whatever is older than `max_age_secs`;
changes go out as `task.pullRequest { task_id, pull_request | null }`. The
desktop calls it on connect and on window focus (120 s staleness) and when a
task is opened (15 s). `git.createPr` forces a re-check of its task.

**Polling is scoped to open pull requests.** The first refresh starts a
three-minute loop that re-checks only entries whose pull request is open or a
draft. A branch without one is looked at again only on focus or open; a merged
or closed one never changes on its own.

**A failed fetch keeps the last known state.** `gh` missing, signed out, no
GitHub remote or offline all read as "nothing to show" for a task never seen,
and as "unchanged" for one that was. A badge that blinks off whenever the
network does is worse than one a few minutes old.

**Checks are one word.** Any failed check or error status is `failing`, then
anything not completed is `pending`, else `passing`; no checks is `None`.
`CANCELLED` counts as failing, as it does in GitHub's own rollup.

**A merged pull request offers the cleanup, the user confirms it.**
`task.archive` gained `remove_worktree`: the checkout and its local branch are
removed through the same path a merge-and-remove uses (`discard_worktree` in
`actor/commands/worktree.rs`). The work is on GitHub, so nothing merges
locally — a squash-merged branch would conflict with its own squash.

## Invariants

1. **No `gh` call on the actor loop** (ADR 0002). `PullWatch` never holds a
   `DaemonHandle`; the poll loop keeps a weak command sender so a dropped
   daemon ends it.
2. **Removal is refused while the agent is mid-turn, the checkout is dirty,
   or HEAD holds commits nothing else keeps.** Removal is `git worktree remove
   --force` then `git branch -D`. `pull_status::removal_blocker` allows it only
   when the pull request's `headRefOid` contains HEAD (squash merges, pruned
   head branches) or no commit is reachable from HEAD alone — not from a
   remote, not from another local branch.
3. **A reply must not undo a newer event.** The desktop stamps every
   `task.pullRequest` and a `task.pullRequests` reply leaves stamped entries
   alone (`daemon/tasks.ts`).
4. **Test daemons never run `gh`.** `PullWatch::default()` fetches nothing
   under `cfg(test)`; tests inject a scripted fetcher.
