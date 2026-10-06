# 0027 — Fork a task

**Status:** accepted (2026-10-01)

## Context

The Sessions page lists agent sessions stored on disk and the tasks already running in the project. Continue uses `task.resume`. Fork needs a new task that starts from an existing one.

## Decision

`session.fork` looks up the task and creates another with the same prompt and agent, the source id as parent, and a `fork:` tag. When the source has a worktree, the new task asks for one too. The Sessions page also shows the pinned grid.

This is a new task, not an ACP `session/fork` call. The daemon does not speak that method yet.

## Rejected

Pretending a copied prompt is an ACP session fork, and leaving Fork as a button that does nothing.
