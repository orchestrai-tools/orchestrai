---
"warpforge": patch
---

Warpforge no longer starts unattended work on an agent account that has run out of quota. A scheduled or manual automation run is recorded as "Skipped · quota" with the account and the time its limit resets, instead of starting an agent that fails right away. A workflow pauses before the stage that would need the exhausted account and tells you why; press Resume once the limit resets. When an orchestrator asks for a sub-agent on an exhausted account, it gets the reason back so it can pick another agent. An account that is only running low, or whose usage could not be checked, is never held back.
