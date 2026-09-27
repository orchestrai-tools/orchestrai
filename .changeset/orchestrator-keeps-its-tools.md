---
"warpforge": patch
---

Orchestrator chats keep their delegation tools when they reconnect. After Warpforge restarts, a long-running orchestrator can still spawn and message agents, read its inbox and run workflows, even if you also added Warpforge to Claude Code yourself. If Warpforge is briefly unreachable, a tool call now says so and the next one reconnects, instead of the tools going quiet.
