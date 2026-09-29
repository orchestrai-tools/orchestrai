---
"warpforge": minor
---

Choose where each Factory item runs. **Run in Factory** and **Run selected in Factory** now ask whether the items run in a worktree, in your project checkout, or wherever the project's default says, and you can change it on a queued item's row. Worktree items keep running while one item uses your checkout, and a checkout that is busy or has uncommitted changes holds back only the items that need it. The new **Auto** run location puts items whose workflow verifies the running app in your checkout and everything else in a worktree, and the Factory warns you when a verifying item is headed for a worktree, where it cannot be tested.
