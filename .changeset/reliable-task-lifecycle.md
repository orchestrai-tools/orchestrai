---
"warpforge": patch
---

Keep follow-up messages and their attachments in order while an agent reconnects. Retrying a blocked task now includes newly attached context, and archiving a task stops its active agents and descendants so they cannot keep changing files in the background. Listing legacy orchestration runs no longer freezes other projects; unsupported legacy cancellation now reports a clear error instead of appearing to succeed.

Sending an image to an agent that cannot read it now preserves the active conversation and reports the refusal so you can adjust your message and retry.
