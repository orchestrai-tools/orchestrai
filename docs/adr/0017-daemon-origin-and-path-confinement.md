# 0017 — The daemon checks WebSocket origins and confines client paths

**Status:** accepted (2026-09-27)

## Context

The daemon listens on loopback. A packaged daemon requires a random token,
but `warpforge daemon --dev` binds the fixed port 61814 with no token so the
web UI can run in a plain browser. Browsers do not apply CORS to WebSocket
handshakes, so while a dev daemon ran, any page the user opened could connect
and send `terminal.input`. Separately, `file.contents` rejected only `..` and
joined the client's path onto the repo root, so an absolute path read any file.

## Decisions

**Every handshake is checked against an Origin allow-list** (`server/origin.rs`).
No `Origin` header means a non-browser client (TUI, MCP bridge, tests) and is
allowed. The packaged webview's origins are always allowed: `tauri://localhost`
on macOS and Linux, `http(s)://tauri.localhost` on Windows (tauri
`protocol::origin`). The Vite dev server (`http://localhost:5173`,
`http://127.0.0.1:5173`) is allowed in `--dev` and in debug builds, because
`tauri dev` loads the UI from Vite and spawns a debug daemon without `--dev`.
`WARPFORGE_DEV_ORIGINS` (comma-separated) replaces the Vite pair. Anything
else gets a 403 before the upgrade.

**Client paths are relative and resolved inside the root** (`diff/files.rs`).
Reads and writes that go through the last component (`file.contents`,
`file.save`) canonicalize the whole path and refuse one that lands outside the
repo, including through a symlink. Create/rename/delete resolve the parents
only, since they act on a link itself.

### Rejected

- **A token in `--dev` too.** The plain-browser UI has no way to read
  `daemon.json`; the origin check closes the hole without breaking it.
- **Allowing any `localhost` origin.** Every local dev server a contributor
  runs, and anything it serves, would reach the daemon.

## Invariants

1. **The Origin check runs on every connection, token or not.**
   (`server/mod.rs` `handle_conn`) Do not go back to `accept_async`.
2. **A missing `Origin` stays allowed, `null` stays refused.** Non-browser
   clients send none; sandboxed frames and `file://` pages send `null`.
3. **No read or write RPC joins a client path onto a root without
   `resolve_in_root`/`resolve_target_in_root`.** Paths that git produced
   (shelf, hunk reject) or that git itself confines (pathspecs) are exempt.
4. **`daemon.json` is written 0600 via a temp file and rename, in a 0700
   directory the daemon creates.** (`server/endpoint.rs`) It holds the token.
