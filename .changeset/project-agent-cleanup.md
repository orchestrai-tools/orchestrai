---
"orchestrai-desktop": patch
---

Removing a project now stops and waits for all its agent sessions, including agents idle between turns. Pending starts and active pipelines are stopped too, so the removed project leaves no agent processes running behind it.
