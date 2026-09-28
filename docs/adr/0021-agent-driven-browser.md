# 0021 — Agents drive the in-app browser through a daemon → client request

**Status:** accepted (2026-09-28)

## Context

Agents could read an element the user picked in the in-app browser, but not
act on a page. WKWebView has no DevTools protocol, and the page views are
native child webviews owned by the desktop app, not by the daemon the agent's
MCP bridge talks to. Until now every exchange was client → daemon; nothing let
the daemon ask a client to do something and wait for the answer.

The browser also has one web session for the whole app (the user's logins,
kept across restarts), so an agent acting in it acts as the signed-in user.

## Decisions

**A general daemon → client request channel** (`daemon/server/client_hub.rs`).
A connection offers capabilities with `client.register`. The daemon sends a
`client.request` event (request id, timeout, typed body) to that connection
alone, never broadcast, and waits for its `client.reply`. When several
connections registered a capability, the newest registration answers; nothing
falls back to an older one after a failure, so an action never lands in a
second app's browser. No registration is an immediate error. A disconnect
fails that connection's requests at once. A timeout, or a caller that stops
waiting, sends `client.requestCancelled`, and a late reply is refused. Only the
connection a request was sent to may answer it. The desktop registers `browser`
on every reconnect, only in the Tauri app (`desktop/src/daemon/clientRequests.ts`).

**Browser actions are DOM scripting, not a protocol.** `browser_agent.js` is an
initialization script in every tab: it keeps console messages from the start
of the load, outlines the page with refs held in a `WeakMap` (no DOM
attributes are written, so the page is not changed by being read) and fires
the event sequence a pointer or keyboard would. Values are set through the
prototype setter plus `input`/`change`, which is what React's controlled
inputs observe. Screenshots are `WKWebView.takeSnapshot` (macOS only).

**The target is the project's active tab; `browser_navigate` opens one.** With
no tab, navigate creates one with a hidden view, and the pane adopts the view
when it mounts; a remembered tab whose view is gone after a restart is
reopened the same way before any action. Other
actions on a project with no page return an error naming `browser_navigate`.
The user's view is never switched to the browser.

**The origin gate is the daemon's list, checked natively by the desktop.** The
daemon allows every loopback spelling of the ports the project's services and
port-forwards were allocated, plus origins the user allowed "always" for the
task (daemon memory, `browser/origins.rs`). `browser_navigate` checks the
target before anything loads. Every other action sends the list with the
request, and the Tauri command compares it with the webview's own URL before
running the script, answering `{ blocked: origin }` otherwise. Anything outside
the list raises a permission prompt on the calling task's chat through the
agent permission flow (`actor/user_ask.rs`): same `PermissionRequest` update,
same `session.permission` answer, routed back to the daemon instead of to the
agent. It waits five minutes, then is withdrawn as cancelled.

**What the agent reads is wrapped as untrusted** (`mcp/untrusted.rs`): a
`<browser_page>` block that says it is data, with a zero-width space after
every `<` from the page — the scheme `formatAnnotation.ts` uses for picks.

### Rejected

- **CDP or WebDriver.** WKWebView exposes neither to an embedding app.
- **Broadcasting the request and taking the first answer.** Two apps on one
  daemon (a `tauri dev` next to the installed app) would race to act.
- **Checking the origin in the page script.** The page can replace anything in
  its own world; the native URL cannot be scripted.
- **Opening the browser pane for the agent.** It takes the user's screen away
  mid-task; a background tab is adopted by the pane anyway.
- **Marking elements with `data-*` refs.** It writes to the page's DOM, which
  frameworks re-render or diff against.

## Invariants

1. **A client request goes to one connection.** (`client_hub.rs`) Never
   through the broadcast bus, and only its recipient may reply.
2. **No page action runs before the native origin check.**
   (`desktop/src-tauri/src/browser_agent.rs` `gate`) A new action goes through
   `browser_agent_call` or does its own `gate` first.
3. **`browser_navigate` is gated on its target, before the load.**
   (`daemon/browser/mod.rs`) Checking the page after it loaded has already
   sent the user's cookies to it.
4. **A daemon prompt's answer never reaches the agent.**
   (`actor/commands/session.rs`) The agent did not ask; forwarding it would
   answer a request the agent does not have.
5. **Everything page-derived stays inside the untrusted block**, URL and title
   included. (`mcp/handle/browser.rs`)
