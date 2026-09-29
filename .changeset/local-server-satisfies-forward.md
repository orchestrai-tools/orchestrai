---
"warpforge": patch
---

Services that depend on a port-forward start again when you run that dependency locally. If a local ClickHouse, Postgres, or your own `kubectl port-forward` already answers on the forward's local port, Warpforge uses it and starts the service right away instead of trying to open a forward that can't bind; the service's log says it is using the local server. If the port is held by something that doesn't accept connections, the service now fails with a reason naming the port, so you know what to stop.
