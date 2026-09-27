# 0017 — The daemon checks WebSocket origins and confines client paths

**Status:** accepted (2026-09-27); amended 2026-09-27 (Vite origins on every
daemon, Windows-only webview origins, component-checked paths)

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
allowed. The packaged webview's origin is always allowed: `tauri://localhost`
on macOS and Linux, and on Windows only, `http(s)://tauri.localhost` (tauri
`protocol::origin`). The Vite dev server (`http://localhost:5173`,
`http://127.0.0.1:5173`) is allowed on every daemon, release builds included:
`tauri dev` loads the UI from Vite and reuses whatever daemon `daemon.json`
names, so a dev app that found a packaged daemon got a silent 403. A daemon
with a token loses nothing by it, since a page still cannot authenticate
without reading `daemon.json`. `WARPFORGE_DEV_ORIGINS` (comma-separated)
replaces the Vite pair. Anything else gets a 403 before the upgrade.

**Client paths are relative and resolved inside the root** (`diff/files.rs`).
Every `Path::components()` entry must be a plain name (or a leading `.`), so
no root, drive prefix or `..` gets through; on Windows `\` and `:` are refused
too, because resolution splits on `/` only. Reads and writes that go through
the last component (`file.contents`, `file.save`) canonicalize the whole path
and refuse one that lands outside the repo, including through a symlink.
Create/rename/delete resolve the parents only, since they act on a link
itself. A refusal is an RPC error the editor shows, `file.save` included.

### Rejected

- **A token in `--dev` too.** The plain-browser UI has no way to read
  `daemon.json`; the origin check closes the hole without breaking it. It
  leaves one: in `--dev`, whatever serves `localhost:5173` — another project's
  dev server, when Warpforge's is not running — can drive the daemon. Closing
  it needs the daemon to mint a `--dev` token and Warpforge's Vite server to
  hand it only to its own page (Vite's CORS lets other localhost origins fetch
  from it, so the endpoint needs its own origin check). Not done yet; run
  `--dev` only while Warpforge's own Vite server holds the port.
- **Vite origins only in debug builds or `--dev`.** A dev app reusing a
  packaged daemon was refused with nothing in the UI to say why; the token
  already protects that daemon.
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
