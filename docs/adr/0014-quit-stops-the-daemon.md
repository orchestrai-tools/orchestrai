# 0014 — Quitting the app stops the daemon it started

**Status:** accepted (2026-09-23); amended 2026-09-27 (see the end)

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

**Every wait is bounded.** The quit check (`app.quitCheck`) gets 3 s, the
confirmed `app.quit` 15 s, since it stops whole service process trees, and the
wait for the daemon process 15 s. A close button that can hang is a close
button that does nothing.

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
   `DaemonProcess::terminate`) The quit check times out at 3 s, `app.quit`
   and the process wait at 15 s. The window must close even when the daemon is
   wedged.
3. **A daemon the app did not spawn is never stopped.** (`dispatch/system.rs`,
   `desktop/src-tauri/src/daemon/stop.rs`) `app.quit` refuses an `owner != desktop` daemon, and the shell
   only reaps the child it holds. A CLI-started daemon outlives the app.
4. **The final exit is only via the Rust `quit_app` command.** The webview has
   no close/destroy permission; adding one would reintroduce the half-quit the
   capability set was hiding.
5. **Running services and port-forwards count as quit blockers, and only as
   quit blockers.** (`src/daemon/actor/run.rs`) `quit_blockers_snapshot` extends
   `update_blockers_snapshot`; the update path must keep ignoring services that
   are merely running, or an update would be refused while any service is up.

## Amended 2026-09-27 — the daemon owns its stdio, and reuse needs a handshake

The packaged app spawns the daemon as a sidecar with piped stdout and stderr.
An app that disappears without quitting — a crash, Force Quit — leaves the
daemon running with no reader on those pipes, and `eprintln!` panics when the
write fails (Rust ignores SIGPIPE, so the write returns EPIPE). A panic in the
actor task is caught by tokio and leaves the server answering on its port:
`system.handshake` never touched the actor, and every other call got defaults.
The next launch found `daemon.json`, got a TCP connect, reused the zombie, and
nothing worked until the daemon was killed by hand.

**The daemon owns its stdio after startup.** Next to the stdin detach, a daemon
whose stderr is not a terminal points stderr at `~/.warpforge/logs/daemon.log`
(appended, owner-only, rotated to `daemon.log.1` when over 10 MB — at startup,
and by a once-a-minute check during a run) and stdout at /dev/null, which the
sidecar never persisted either — unless the dev app spawned it with
`WARPFORGE_DAEMON_STDIO=inherit`, handing over its own stdio rather than a
pipe, so dev output stays in the dev terminal. The daemon removes that variable
from its environment once read, so nothing it spawns inherits it. If the log
cannot be opened, both go to /dev/null; a rotation that fails keeps appending.
`desktop-sidecar.log` keeps the shell's lifecycle lines and whatever the daemon
printed before it switched. Unlike that file, `daemon.log` is not redacted and
has no per-line cap: both need the lines to pass through a pipe, which is the
thing this amendment removes.

**Reuse a found daemon only after a handshake.** At launch the shell
authenticates and sends `system.handshake` as the web UI does, and the daemon
refuses the handshake once its actor's mailbox is closed. The whole probe,
connect included, is bounded by 5 s, not the 3 s of the quit check: a false
silence kills a healthy daemon along with its agents and services, without the
quit dialog. What happens next depends on how far the probe got, and on
whether the recorded pid is still that daemon:

- **Answered:** reuse it.
- **Pid gone, or now another process:** start a new daemon.
- **Connection refused, pid alive:** the daemon is shutting down. SIGTERM
  closes its listener at once, but the teardown — service group kills, agents,
  the database flush — continues, and `daemon.json` goes last. The shell waits
  up to 15 s for the process to exit, sends no signal, then starts a new one.
- **Accepted but no answer, pid alive:** a desktop-owned daemon is stopped
  (SIGTERM, 5 s, SIGKILL) and replaced; an external one is left running while
  `daemon_endpoint` tells the UI it is not responding.

"Still that daemon" means the pid was started with a `daemon` argument and has
the executable path and start time the daemon wrote into `daemon.json`. An
entry from an older daemon, without those, falls back to the executable's name
(`warpforge`, or `wf` as `install.sh` names the CLI).

### Rejected

- **A non-panicking macro in place of `eprintln!`.** Every future call site
  would have to remember it; replacing the descriptor covers all of them.
- **Keeping the TCP connect as the reuse check.** The kernel completes a
  connect to a listening socket whether or not anything still serves it.

### Invariants (added)

6. **Never leave the daemon's stdout/stderr on a pipe the app owns.**
   (`src/daemon/server/stdio.rs`) Once the app is gone the next write fails,
   and a panic in the actor makes a zombie that holds the port.
7. **Reuse a found daemon only after a handshake.**
   (`desktop/src-tauri/src/daemon/startup.rs`, `dispatch/system.rs`) The
   handshake must keep failing when the actor is gone; a reply that needs no
   actor proves only that the accept loop runs.
8. **Signal a recorded pid only while it is still that daemon.**
   (`desktop/src-tauri/src/daemon/stop.rs`, `server/endpoint.rs`) `daemon.json`
   outlives a crashed daemon, and its pid can be reused — by the TUI or the MCP
   bridge, which run the same binary. Compare the start time and executable it
   records, and the `daemon` argument; a name match alone is not identity.
   This is the one case where the shell stops a daemon it does not hold, and
   only a desktop-owned one: invariant 3 still holds for a daemon started
   outside the app.
9. **Never signal a found daemon that refuses the connection.**
   (`desktop/src-tauri/src/daemon/startup.rs`) Its listener closed because it
   is shutting down; a SIGKILL would land in the middle of its teardown.
   Replace only a daemon that accepts the connection and then fails the
   handshake.
