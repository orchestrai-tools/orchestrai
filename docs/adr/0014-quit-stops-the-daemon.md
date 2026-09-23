# 0014 — Quitting the app stops the daemon it started

**Status:** accepted (2026-09-23)

## Context

The desktop shell spawned the daemon as a background service and deliberately
never stopped it. The run loop was `.run(|_, _| {})`, and the comment said why:
"Daemon remains a background service so ACP sessions can survive UI restarts."
The window's close button went through a JS listener that stopped the runtime and
then asked the window to close — but the Tauri capability set granted no
`allow-close`, so that call was rejected and the window stayed open *after* every
service had already been stopped. ⌘Q and Dock → Quit bypassed that listener
entirely, and the daemon outlived the app; only killing `tauri dev` took it down
with the process group.

So the app had a close button that did nothing, a quit that left a daemon and its
services running, and a JS flow that could stop work without ever asking.

## Decisions

**One quit path.** The window's close button, ⌘Q and Dock → Quit all arrive at
`RunEvent::ExitRequested`. The shell calls `api.prevent_exit()` and emits
`app:quit-requested`; the web UI's `useTauriClose` answers both that event and
`onCloseRequested`. The final exit is a Rust command, `quit_app`, which sets
`ALLOW_EXIT` and calls `app.exit(0)`. Routing the exit through Rust means the
webview needs no window close or destroy permission.

**Ask once, then stop everything.** The UI calls `app.quitCheck`; when nothing is
running it quits immediately, and otherwise it shows one dialog listing agent
tasks, terminal sessions, services (running *or* starting) and port-forwards.
"Stop everything and quit" runs the quit; "Wait" cancels and the app stays open.

**A quit stops the daemon only when the app owns it.** `app.quit` is owner-checked
like `update.prepareShutdown`: a daemon started outside the app is refused and
left running. A daemon the app spawned is stopped — the RPC stops the runtime and
agent sessions and ends the daemon, and the shell waits (bounded) for the child
to exit, then TERM/KILLs it if it will not.

**Every wait is bounded.** The daemon RPCs get 3 s, the wait for the daemon
process 5 s. A close button that can hang is a close button that does nothing.

### Rejected

- **Keep the daemon running in the background (the previous behaviour).** It
  preserved ACP sessions across UI restarts, but it also left services, agents
  and terminals running with no window to see or stop them — quitting did not
  quit. Conversations persist in the database regardless, so the sessions that
  mattered survive a restart by being resumed, not by keeping a process alive.
- **A "keep running in the background" option in the dialog.** It makes every
  future quit path carry a mode, and it re-opens the orphan problem for the
  option's users. If a background daemon is wanted, start one from the CLI —
  which a quit then deliberately leaves alone.
- **Stopping the daemon from JS with `window.close()`/`destroy()`.** It needed a
  capability the app did not grant, and granting it does not fix ⌘Q or the
  Dock, which never reach JS first.

## Invariants

1. **Exactly one quit path.** (`desktop/src/hooks/useTauriClose.ts`,
   `desktop/src-tauri/src/main.rs`) Every entry point refuses the exit, emits
   `app:quit-requested`, and finishes through `quit_app`. Do not add a second
   place that calls `app.exit` or `window.close` on the main window.
2. **Every wait on the quit path is bounded.** (`useTauriClose.ts`,
   `DaemonProcess::terminate`) The daemon RPCs time out at 3 s and the process
   wait at 5 s. The window must close even when the daemon is wedged.
3. **A daemon the app did not spawn is never stopped.** (`dispatch/system.rs`,
   `main.rs`) `app.quit` refuses an `owner != desktop` daemon, and the shell
   only reaps the child it holds. A CLI-started daemon outlives the app.
4. **The final exit is only via the Rust `quit_app` command.** The webview has
   no close/destroy permission; adding one would reintroduce the half-quit the
   capability set was hiding.
5. **Running services and port-forwards count as quit blockers, and only as
   quit blockers.** (`src/daemon/actor/run.rs`) `quit_blockers_snapshot` extends
   `update_blockers_snapshot`; the update path must keep ignoring services that
   are merely running, or an update would be refused while any service is up.
