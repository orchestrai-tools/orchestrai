---
"warpforge": minor
---

The Factory can now run items in your project checkout, so workflows with a verify stage can test each change in your running app. In the Factory's **Settings**, set **Run location** to **Project checkout**: items run one at a time on a fresh branch from origin's default branch, your dev services serve the change as it is built, and after the draft pull request opens your checkout goes back to the branch you were on. Your work is safe: the Factory waits while your checkout has uncommitted changes, and if a run leaves changes behind it pauses and tells you in **Needs you** instead of discarding anything. A Factory pipeline's summary now ends with what happened to it — the draft pull request it opened, no changes to deliver, or why delivery failed.
