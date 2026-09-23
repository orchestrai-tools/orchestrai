---
"warpforge": patch
---

Agents working in an isolated worktree now know the running dev services belong to the main checkout, not their own, so restarting a service will not test their edits. Opening a task's Terminal tab starts the shell in that task's worktree.
