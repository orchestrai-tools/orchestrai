# 0022 — An advisor is a hidden, read-only child session the executor consults

**Status:** accepted (2026-09-29)

## Context

"Review with…" (#80) handed a finished diff to a second agent. It failed
because a diff-only reviewer has no task context: it cannot tell whether the
change does what was asked, only whether the lines look plausible. Workflow
pipelines (ADR 0001) fix that with a full review loop, at several times the
cost. Advisor mode (#109) sits between: one agent does the work and, when it
chooses, asks a second agent — another harness or a stronger model — that
knows the task.

## Decisions

**The advisor is a task, not a new kind of session.** One hidden child task
per executor (`origin: "advisor"`, tag `advisor`, `parent_task_id` = the
executor), created on the first question and prompted again on each later one,
so it remembers its earlier advice. It reuses everything a task already has:
account pinning, resume after a restart, persisted transcript, cost reporting,
cross-harness agents. `origin` keeps it off every board-shaped list (ADR 0010's
mechanism). Code: `src/daemon/actor/advisor/`.

**The advisor works in the executor's checkout without owning it.**
`advisor_cwd` resolves the executor's worktree at session start; the advisor
task records no `worktree`, because deleting, archiving or merging a task
removes the worktree it records.

**The executor learns about the advisor at session start, not per turn.**
`EXECUTOR_NUDGE` is prepended to the opening prompt the way the runtime and
memory preambles are (`start_session`), telling it to consult before a big
design decision, when stuck, and before declaring the task done. v1 has no
automatic checkpoint at turn end: the executor decides, and a nudge the agent
can ignore is cheaper to get wrong than a daemon-forced consultation that runs
on every "done".

**The bridge's mode carries the role.** `WF_MODE` / `WARPFORGE_SESSION_MODE`
gained `advised` (single tools plus `ask_advisor`) and `advisor` (read-only
tools only, no browser). Tool lists are served before the bridge talks to the
daemon, so the role has to arrive in the environment; it travels as part of
the session identity unit of ADR 0018.

**Read-only is enforced in four places, because no single one holds for
every harness.** (1) The advisor's permission requests are denied by the
daemon on arrival, never shown to anyone. (2) Its `fs/write_text_file` is
refused before any policy runs. (3) Its bridge serves only reading tools
(`mcp/tools/advisor.rs` `READ_ONLY_TOOLS`) and refuses the rest. (4) Its
session is switched to the harness's read-only mode when the agent's cached
selectors advertise one — `read-only` (Codex), `plan` (Claude Code, opencode)
— on every start including a resume (`advisor_overrides`; `init.rs` now applies
overrides on resume too, and only the advisor passes any there). The prompt
says it only advises. A harness with none of the modes, run with a permission
setting that never asks, is held by the prompt and (2)–(3) only.

**Each question carries a bounded digest, not the transcript.** The first
prompt has the role, the task title and opening prompt; every prompt has what
happened since the previous `AdvisorConsultation` in the executor's transcript
— the last three user messages, the last four executor messages (each clipped
from the front, since an agent's conclusion is at its end), `git status
--short` capped at 40 lines — plus the question and the executor's `context`.
The previous consultation marker is the transcript entry itself, so "since the
last question" survives a restart without extra state.

**`ask_advisor` blocks, in windows the executor's harness can survive.**
`advisor.ask` opens the consultation and waits; if its window ends first it
returns `pending`, and `ask_advisor` with `wait: true` calls `advisor.wait`
for the same answer. Claude Code waits on an MCP call as long as it takes, so
it gets the whole deadline; every other harness gets 50-second windows because
Codex times an MCP tool call out at 60 seconds. An answer that finds no waiter
is kept as `unread` for the next `wait`.

**Guards.** Three questions per executor turn (reset on its `TurnStarted`);
one pending question at a time; a 15-minute deadline after which the advisor's
session is stopped so a late answer cannot be taken for the next question's;
the quota gate (ADR 0019) on every question, judged on the advisor's own pinned
account once it has one.

**The answer is the advisor turn's closing message** (ADR 0001 invariant 3's
rule), falling back to the whole turn. It reaches the executor as the tool
result and the chat as an `AdvisorConsultation` session update in the
executor's transcript — the collapsed "Asked advisor" block, which links to the
hidden task.

**Cost is attributed on the executor.** `TaskAdvisor.cost` sums, per
consultation, the rise in the advisor session's reported running cost (USD
only; a drop means the session restarted, and the new total is the delta).
Per-agent spend still counts the advisor under its own agent.

### Rejected

- **A per-turn sidecar prompt instead of a persistent session.** Every
  question would re-read the codebase and forget the earlier advice.
- **The orchestrator inbox as the answer channel.** It is asynchronous by
  design; the executor needs the answer inside the tool call. The advisor is
  excluded from `deliver_child_result` and `turn_output_has_consumer`.
- **Recording the executor's worktree on the advisor task.** Deleting the
  advisor would remove the executor's checkout.
- **Relying on the harness's tool-call rendering for the chat block.** Whether
  a tool result is shown, and how, differs per harness; the daemon writes its
  own record.
- **An advisor for orchestrator or workflow tasks.** `task.create` refuses the
  combination; both already have their own second opinions.

## Invariants

1. **An advisor task never records a `worktree`.** (`advisor/ask.rs`
   `start_advisor`) It would take the executor's checkout with it when deleted.
2. **Only the advisor turn that started after its prompt was handed over
   answers a consultation.** (`Consultation::started`, set on `TurnStarted`)
   An earlier turn ending would deliver someone else's answer.
3. **An advisor's result never reaches the orchestrator inbox.**
   (`actor/output.rs`) Its parent is an executor, not an orchestrator; an inbox
   entry would wake it with a bogus "sub-agent result ready".
4. **Every advisor start gets the read-only overrides, resume included.**
   (`start_session` → `advisor_overrides`) A resumed advisor otherwise runs in
   the harness's default mode.
5. **Deleting an executor deletes its advisor.** (`advisor_task_deleted`) The
   advisor is on no list, so nobody else would ever remove it.
