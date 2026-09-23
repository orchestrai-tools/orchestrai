---
"warpforge": patch
---

Isolated task copies are now cleaned up reliably, even after you restart Warpforge or update the app. Deleting a task removes its isolated copy and build files instead of leaving them behind, and a task that could not get its own copy now tells you why in "Needs you" rather than quietly running in your main checkout.
