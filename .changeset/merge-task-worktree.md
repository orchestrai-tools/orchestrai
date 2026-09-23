---
"warpforge": minor
---

Merge a task's work back into its base branch from the task itself. **Merge into the base branch** in the branch menu fast-forwards when it can and writes a merge commit otherwise, all without disturbing your own checkout — it only touches a checkout that already has the base branch, and only when that checkout is clean. A conflict changes nothing and tells you what to do. Merging removes the worktree and finishes the task unless you clear the option.
