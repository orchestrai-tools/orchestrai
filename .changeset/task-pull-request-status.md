---
"warpforge": patch
---

Tasks in their own worktree now show their pull request. The sidebar row marks it open, draft, merged or closed, with a dot when checks are failing or still running, and the task header shows the number, state and checks — click it to open the pull request on GitHub. Status refreshes when you open a task or return to the app, and every few minutes while the pull request is open. Once it merges, **Archive and remove worktree** in the header or the row's menu files the task away and cleans up its worktree and branch in one step, after asking first. Requires the GitHub CLI signed in; without it nothing changes.
