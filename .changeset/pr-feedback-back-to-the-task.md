---
"warpforge": patch
---

Failed checks and review comments on a pull request now find their way back to the task that opened it. When CI fails or a reviewer leaves a comment, the task moves to Needs you with a notice such as "PR #12: 2 checks failed · 3 new comments". Press **Send to agent** and the same agent gets all of it in one message, in the same conversation: each failing check with its link and the command to read its log, then each comment with its file, line, quoted code and author. If the agent is busy, the message waits its turn. **Dismiss** clears the notice, and nothing you have already sent is raised again. The Checks section of a pull request in the Inbox now lists every check on the latest commit, failures first, each linking to its run.
