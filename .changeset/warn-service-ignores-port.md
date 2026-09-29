---
"warpforge": patch
---

Runtime now tells you when a service ignores the port Warpforge gave it. If a dev server is running but nothing answers on its assigned port, its row shows a warning such as "Listening on 4321, not 4400 — pass $PORT to its command, e.g. `--port $PORT`", and agents see the same warning when they list the runtime. Service commands can also use `${service.port}` directly, so `--port ${web.port}` just works.
