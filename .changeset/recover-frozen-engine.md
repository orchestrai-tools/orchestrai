---
"warpforge": patch
---

If Warpforge quits unexpectedly, the next launch no longer gets stuck on a frozen background engine. Warpforge now checks that the engine left running actually responds before connecting to it: one the app started is restarted automatically, and one you started yourself from the CLI is left running, with a clear message that it is not responding so you can stop it and relaunch.
