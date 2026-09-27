# 0016 — Service readiness has one verdict per run, and a deadline

**Status:** accepted (2026-09-27)

## Context

A service entered `Starting` and left it only when a port probe or a log line
said so. The port probe gave up silently after about five minutes, and
`healthcheck` was parsed but never polled. A service that never came up stayed
`Starting` for good, which blocks app updates, and `dependsOn` ordered spawns
without waiting for anything.

## Decisions

**Every run gets exactly one final readiness verdict: ready or exited.**
The probe task, both log readers and the exit waiter share one `settled` flag
per run (`service/ready.rs`). The first to swap it reports, and the rest go
quiet. A timeout is not final. It reports `NotReady` once, then the probe keeps
going at `max(interval, 5s)` for as long as the run lives. Results carry `run_id`, and `apply_event` drops any result whose run is
not the current one.

**A healthcheck is the only authority when configured.** Log heuristics and the
port probe are ignored for that service. *Rejected:* first signal wins. The
heuristics match any line containing `localhost:`, so a dependent would start
before the endpoint it depends on answers.

**A service with no signal at all (no port, healthcheck or `readyPattern`) is
ready as soon as it is spawned.** Workers have nothing to probe. With a ready
timeout, waiting on them would fail every one of them after `readyTimeout`.

**The ready timeout fails the service but does not kill it.** Its status is
`Failed`, and its log says `did not become ready within …: <last probe
error>`. The user still has its logs, and Stop and Restart still work. A late
ready moves it `Failed → Running` (`LateReady`, logged `[service ready] after
…`). The default is 5m, close to the old port probe's window, because cold
first builds (`cargo run`, large Vite or Next apps, image pulls) regularly
take minutes. It can be set lower or higher per service. *Rejected:* killing
the process, which throws away the evidence the reason points at. *Rejected:*
a 2m default with no recovery, which left slow first starts failed for good.

**`dependsOn` waits via a process-less `Starting` placeholder**
(`ManagedService::waiting_on`). The actor re-checks the placeholders on every
service or port-forward status event (`actor/service_start.rs`), then spawns
them or fails them. Nothing awaits readiness. Waiting has no timeout of its
own: every dependency either has one or, for port-forwards, a retry limit.
Starting one service also starts the dependencies that are not up. A
dependent failed by the gate keeps `waiting_on`, so it starts if every
dependency later becomes ready. This covers the late-ready case, and also a
dependency the user restarts by hand. *Rejected:* recovering only dependents of
a timed-out dependency, which needs a separate "why failed" field for no real
difference.
Undeclared dependency names are ignored here. Config validation reports them.
A declared port-forward with no runtime entry is pending, and a waiting
service starts it.

**A held entry reserves its port.** A placeholder, and a dependent failed by
the gate, claims its port when it is held, so `${name.port}` resolves for a
service that starts while it waits, and its own start reuses that port. Stop,
removal and a refused start release it. *Rejected:* allocating at spawn, which
failed every service whose `env` names a waiting one's port.

**Liveness is tracked apart from status** (`ManagedService::alive`). It is set
at spawn and cleared when the run's exit is applied or the run is killed, so a
timed-out run is `Failed` and alive. Start all and project open skip a service
whose run is alive. Only an explicit Start or Restart of that service replaces
it, and Start logs `[service restarting]` first. Quit and project removal count
such a run as running. The kill handle of an exited run is kept, so the next
start or stop still reaps what is left of its process group.

## Invariants

1. **A timeout is a verdict about waiting, not about the process. A late
   ready still wins while the run is alive** (`service/ready.rs`). Every ready
   path goes through `RunHandle::report_running`, which settles the run and
   turns into `LateReady` after a timeout. The exit waiter and Stop end the
   recovery probe. `LateReady` can overtake its own `NotReady`, so it counts
   while `Starting` too. A stale `run_id`, or a run whose exit or stop was
   already applied, never flips.
2. **`waiting_on` is set only on an entry with no live process:** a `Starting`
   placeholder, or a `Failed` dependent held for recovery. `stop_key` clears
   it, and `ServiceManager::start` treats both as startable. A stale hold
   either deadlocks the dependents or auto-starts something the user stopped.
3. **Every way a dependency can settle must reach `advance_waiting`.** That means
   service and port-forward status events, plus the commands that change a
   status without one: `StopService` for a placeholder, `StopPortForward` and
   `StopAllPortForwards`. A missed path leaves the dependent waiting forever,
   the exact bug this record exists for.
4. **A `dependsOn` cycle fails at launch.** Cycles used to fall back to
   alphabetical order, but with waiting they deadlock instead.
5. **Never replace a service entry whose process may still be alive.**
   `mark_waiting`, `fail_waiting` and `fail_start` build a process-less entry.
   Built over a live run, they drop its stop flag and exit events, so Stop,
   Stop all and quit no longer reach it, and the next start runs a second
   copy. Stop the old run first, as an explicit Start does, or leave the entry
   alone, as Start all does.
