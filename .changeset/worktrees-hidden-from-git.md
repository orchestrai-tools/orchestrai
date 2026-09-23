---
"warpforge": patch
---

Task worktrees no longer show up as untracked files in your main checkout. Warpforge now keeps its `.worktrees/` folder out of `git status` automatically, so staging everything with `git add .` cannot pull in another task's checkout, and file search and the editor tree stay free of every task's copy.
