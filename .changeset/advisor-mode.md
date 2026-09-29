---
"warpforge": patch
---

Give a single-agent task an advisor: turn on **Advisor** in New Task and pick a second harness or a stronger model — Claude Code working with Codex advising, or the reverse. The agent consults it before big design decisions, when it is stuck, and before it calls the task done, and the advisor answers knowing the task's goal, the recent conversation and the changed files, not just a diff. Each consultation shows up in the chat as a collapsed "Asked advisor" block with the question, the answer and what it cost. The advisor only reads: it can never edit your code.
