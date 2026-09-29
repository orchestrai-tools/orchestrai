---
"warpforge": patch
---

The wrong-port warning on a service now names only ports that actually answer, so a service that also starts other dev servers no longer points you at the wrong one. Starting a port-forward by hand now fails right away, with a clear reason, when its local port is already served by another process.
