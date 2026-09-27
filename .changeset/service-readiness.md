---
"warpforge": patch
---

Services that never come up no longer sit in "starting" forever. If a service isn't ready within five minutes, it is marked failed, and its log says why, for example the health endpoint answering 503 or nothing listening on its port. The process keeps running, so you can still read its logs. If it comes up late, it switches back to running on its own, and anything waiting on it starts then. Set `readyTimeout` on a service to make that window shorter or longer. Services with a `healthcheck` are now actually checked: they count as running once the URL answers. A service that depends on another now waits until that one is ready before it starts. If the dependency fails, the dependent is marked failed with a reason naming it, so it never starts against a service that isn't up.
