---
"warpforge": patch
---

New task worktrees can now set themselves up. Add a `worktree:` section to your project's workspace config to copy files such as `.env` into every new worktree and to run a setup command there; if setup fails, the task stops with the reason and the worktree is kept. A new Worktrees tab on each project lists every worktree with its branch, owning task and disk size, lets you reclaim build folders like `node_modules` and `target`, and remove worktrees you no longer need. Removal always asks first and is refused while there is unsaved or unpushed work.
