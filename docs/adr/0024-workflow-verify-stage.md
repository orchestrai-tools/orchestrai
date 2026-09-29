# 0024 — Workflows verify a change in the running app before review

**Status:** accepted (2026-09-29) · amends the fixed shape of
[0001](0001-workflow-pipelines.md)

## Context

A pipeline's reviewers read a diff. Nobody ran the app. For tasks written by
analysts (an issue describing a user flow) the question that matters is
whether the flow works, and the in-app browser (ADR 0021) plus the runtime
tools already let an agent answer it. What was missing was a place in the
deterministic pipeline for that check, a verdict the engine can act on, and
somewhere to keep the evidence.

## Decisions

**One optional stage in the fixed shape, not a DAG.** The shape becomes
`plan? → implement → verify? → review ⇄ fix`. `verify:` in the workflow file
enables it (`agent`, `model`, `instructions`, `required`, `max_attempts`); the
new built-in `verify-review-loop` has it on. *Rejected:* configurable stage
graphs, for the reasons 0001 gives.

**Verify runs before review, and a failure goes to fix, not to reviewers.**
Implement → verify; a fix after a failed verification → verify, always; a fix
after a review → verify only when it changed the working copy (FNV-1a over the
rendered diff, taken when the fix starts); a pass → review. The failed steps
become the fix stage's findings. Reviewers only see work that passed.

**Attempts count failures in a row.** `verify_failures` resets on a pass.
Reaching `max_attempts`, or a `blocked` verdict, parks a required verify at
`AwaitingVerifyDecision`, exposed as the existing `limit` wait with
`stage: verify` so every client's decision UI and `workflow.decide` keep
working: `extend` grants attempts and runs a fix (or retries a blocked
check), `finish` continues to review without a pass, `stop` ends the run.
`required: false` notes the failure and continues to review instead.

**The verdict reuses the review protocol's fence.** A fenced JSON block with a
`verdict` key — `pass | fail | blocked`, `summary`, `checklist[{step, status,
note, evidence}]`, `findings[]` — parsed with the same last-block-with-key
extraction, stripped from display the same way, re-asked once when
unparseable. A tester that still gives nothing parseable counts as `blocked`.

**Evidence is captured by the daemon, not reported by the agent.** When the
task behind a `browser.act` screenshot is a running verify stage, the daemon
reserves `shot-N.png|jpg`, writes it under
`~/.warpforge/evidence/<parent task id>/`, and tells the agent the name so the
checklist can cite it. Outside the project on purpose: a file in the checkout
would show up in the diff under review. Deleted with the task. Read back with
`workflow.evidence`. *Rejected:* storing base64 in the transcript (every
history load would carry megabytes), and trusting the agent to save files.

**The report is on the run.** `WorkflowRunInfo.verifications` lists every
attempt (verdict, checklist, evidence with paths); `WorkflowRunInfo.report`
holds the final Markdown summary, verification section included, once the run
ends. That is what a pull-request body should be built from.

**A task in its own worktree is refused, honestly.** Dev services run from the
project root (`service/spawn.rs` `current_dir(project_path)`; #93), so they
serve the main checkout, not the worktree. Testing them would report on code
that is not the change. The stage records `blocked` with that reason without
starting an agent, and a required verify parks for the user.

## Invariants

1. **A `fail` never reaches review as a pass.** A `pass` with a failed step is
   read as `fail`, and a `fail` always carries findings — from `findings`, the
   failed steps, or the tester's prose (`workflow/verify.rs`
   `parse_verify_verdict`).
2. **Verify findings live apart from review findings** (`verify_findings` vs
   `open_findings`, `findings_source` says which the next fix repairs). A
   verify failure between review rounds must not erase what the next review
   has to re-check.
3. **Evidence names and task ids are single path components**
   (`workflow/evidence.rs`); the RPC reads nothing else.
4. **Tests never write to the user's home.** Under `cfg(test)` the evidence
   root is a per-process temp directory.
5. **The actor's futures never hold `&Daemon` across an await.** The daemon is
   not `Sync`; diff reads take the directory, not `&self`
   (`actor/workflow_verify/fix_base.rs` `changes`).
6. **Routing out of `workflow_spawn_verify` is boxed.** It can start the next
   stage, which re-enters `workflow_spawn_stage`.

## Consequences

- One more agent session per implement/fix, with a browser and services: slow,
  and it needs the desktop app connected (no app means `blocked`).
- Until per-worktree services exist, the runner's worktree tasks cannot use
  verify; the stage says so instead of pretending.
- A custom `fix.prompt` written for reviewers receives verification findings
  in `{{findings}}` too.
