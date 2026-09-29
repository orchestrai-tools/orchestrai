---
"warpforge": minor
---

Workflows can now test a change in the running app before anyone reviews it. Add a `verify` stage, or pick the new **Implement + verify + review loop** built-in: after the implementation and after each fix, an agent starts your dev services, walks through the flow the task describes in the in-app browser, checks the console for errors and takes screenshots. A failure goes straight back to the fix stage; only a pass reaches the reviewers, and if verification keeps failing the task waits for you in **Needs you**. The verdict, the checklist and the screenshots are on the verify stage in the Pipeline view and in the pipeline's final summary. Keep the desktop app open while it runs; tasks in their own worktree can't be verified yet.
