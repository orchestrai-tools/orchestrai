# 0019 — Unattended work is gated on known quota exhaustion, at dispatch

**Status:** accepted (2026-09-28)

## Context

The daemon polls every account's quota (`src/daemon/limits/`), but nothing
read it before starting work. Automations, workflow stages and orchestrator
sub-agents started agents on accounts that were already out of quota; each
failed on its first turn with a rate-limit error nobody was watching.

A policy engine (`src/policies/`) existed with a `Phase::Spawn` hook and a
`SpawnBoundsPolicy`, but no code ever evaluated the spawn phase. The only live
use of the engine is the ACP `fs/write_text_file` check.

## Decisions

**One verdict function, `limits::gate::refusal`, called at each dispatch
point**: `dispatch_run` (scheduled and manual automation runs),
`workflow_spawn_stage` (every stage, every reviewer), and `task.create` for
tasks tagged `subagent` (the orchestrator's `spawn_agent`). Glue lives in
`actor/dispatch_gate.rs`.

**Only known exhaustion refuses.** A window at 100% whose reset is still in
the future, or a provider's explicit exhaustion flag. A throttled poll, a
missing row, a reset time already past, or a full model-scoped window
(`seven_day_opus`, `seven_day_sonnet`) all allow. A run on the shared home
(no recorded account) is never refused: no row can speak for it.

**Each dispatcher reports refusal in its own terms.** An automation run is
`SkippedQuota` (it never started, so it is a skip — ADR 0007). A workflow parks
at the pause barrier before the stage (ADR 0003's barrier); resume re-checks.
`spawn_agent` gets an `AgentUnavailable` RPC error carrying the reason.

**Tasks a person creates are not gated.** Someone at the keyboard sees the
failure and can switch accounts; an unattended run cannot.

*Rejected:* implementing the gate as a `Policy`. The engine evaluates a
`PolicyContext` built from an existing task, is async, and its `Ask` verdict
has no dispatch-time surface. The gate runs before a task exists and needs the
actor's quota snapshot. The never-consulted parts of the engine
(`SpawnBoundsPolicy`, `CostBudgetPolicy`, `WorktreeGuardPolicy`, the unused
`evaluate_policies`) were deleted; the live file-write check was kept.

## Invariants

1. **Never treat a 429 as exhaustion.** Throttled rows carry no windows and
   `exhausted: false` (`limits/shared.rs`); the gate must keep allowing them.
2. **Judge the account the run will actually use.** A reused automation
   session and a same-session re-review stay on their pinned account
   (`spawn_account`), not the active one.
3. **The workflow gate runs before `round` is incremented**, or a parked review
   round is counted twice on resume.
4. **A refused automation run releases the overlap guard** (ADR 0007
   invariant 3), or the automation never runs again.
5. **Test daemons neither fetch quota nor touch the on-disk snapshot**
   (`cfg(test)` in `limits/cache.rs` and `actor/spawn.rs`); a test that
   injects limits would otherwise overwrite the user's real cache.
