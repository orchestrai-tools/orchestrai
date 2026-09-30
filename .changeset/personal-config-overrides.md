---
"warpforge": minor
---

Keep your own runtime setup without touching the shared config: put overrides in `.warpforge/workspace.local.yaml` and they are layered over the project's config. Point a service at a port-forward instead of a local dependency, change a port, add a service only you run, or drop a forward you never use. The file is kept out of git automatically, edits apply as you save, and Runtime marks the services and port-forwards it changed with a "local" badge.
