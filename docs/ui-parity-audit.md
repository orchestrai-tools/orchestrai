# Warpforge → OrchestrAI UI parity

Audited 2026-10-06. Fork baseline: `1982df0`. Upstream baseline:
[`9ed9d8bb4b5f19886ce558d8e6ab46c3a7d3a344`](https://github.com/warpforgehq/warpforge/tree/9ed9d8bb4b5f19886ce558d8e6ab46c3a7d3a344).

## Result

The UI replacement had lost functionality. Six confirmed gaps were restored:
initial prompt attachments/file references, follow-up attachment handling,
mid-turn Send, automatic task naming, the native agent-browser bridge, and
recovery from a removed task checkout.
No upstream RPC method was removed. This is evidence of API retention, not a
claim that every endpoint or every external integration has passed a live test.

## Baselines and method

- Cloned the official upstream repository into a disposable temporary folder.
- Compared its original user-facing `desktop/src/{views,components,hooks,app}`
  source with the retained frontend: **371 TypeScript source files, no differences**
  at the fork baseline. Tests and extracted protocol/client internals were excluded.
- Enumerated serialized methods in both Rust protocol enums: upstream **194**,
  fork **202**, removed **0**. Additions: `channel.list`, `channel.post`,
  `docs.list`, `docs.write`, `session.fork`, `shell.commands`, `shell.run`,
  `task.setOrigin`.
- Compared original daemon helper calls and literal RPCs with new pages,
  dialogs, palette actions, and the shared daemon client. Followed indirect
  calls and dynamic shelf/stash methods manually; string absence alone was
  not treated as evidence of a lost feature.
- Compared startup side effects and native commands separately. This caught
  browser registration, which a page/endpoint inventory alone missed.
- Traced original prompt payloads, attachment validation, and naming settings
  through the new-task submission and conversation composer.
- Used the running Chrome app and real Codex sessions for the restored queue,
  initial project reference, and naming flows. Temporary tasks changed no files
  and were removed after evidence capture. Preferences were restored.

## Confirmed regressions and repairs

| ID | Original behavior lost in the new UI | Repair and evidence |
|---|---|---|
| P1 | New task used a plain textarea, losing uploads and @file completion/context. | `components/new-task/goal.tsx` restores multi-file picking, drops, screenshot paste, and project-file suggestions. `submit.ts` sends attachments. Chrome confirmed README completion and an initial README attachment reaching Codex; payload regression test covers a document and a ranged project file. |
| P2 | Follow-up picker/drop read only one file; clipboard images, strict text decoding, aggregate limits, and image capability validation were missing. | Both composers now use the original validators extracted to `packages/core/src/{fileAttachments,imageAttachments}.ts`. Original validation tests pass. Documents remain supported without image capability. A rejected batch attaches nothing. |
| P3 | Send was disabled while the agent was running, despite backend queue support and visible queue controls. Keyboard and button behavior differed. | Send now works mid-turn while retaining workflow barrier restrictions. Chrome sent a message during `sleep 45`, edited the queued text, force-sent it, and received `QUEUE_PARITY_EDIT_OK`. Rendering tests verify normal turns remain sendable and autonomous pipelines remain blocked. |
| P4 | Settings offered Name new tasks and a text-writing agent/model, but ordinary new-task submission never invoked naming. | `lib/auto-name-task.ts` restores asynchronous naming after creation. Tests cover chosen agent/model, disabled/no-writer cases, and failure isolation. Chrome generated “Acknowledge to-do creation with NAMING_PARITY_OK” automatically. |
| P5 | Native Browser pane existed, but `main.tsx` omitted the original `installBrowserAgent` startup call. No client registered to serve the agent browser tools. | Startup registers the bridge again. The upstream driver preserves dedicated agent tabs, allowed origins, load observation, screenshots, and closed-tab errors. `browser-agent-tabs.ts` lets new task panes adopt background project tabs. Four tests cover registration/cleanup, origin forwarding and tab isolation, background adoption, and refusals. Production build passes. Native live validation is still pending. |
| P6 | Removing the selected task left its remembered file/git scope selected. Chrome showed an empty “Task worktree” selector and merge action for a deleted task. | `fileTaskId` now accepts remembered tasks only when present in the current project; otherwise it selects the checkout. Regression tests cover removed tasks and a remembered task from another project. |

## Feature-family trace

“Mapped” means source wiring was checked against the retained original and
backend. It does not mean every action below was freshly executed live.

| Feature family | New UI entry points | Backend/client trace | Assessment |
|---|---|---|---|
| Project registration, setup, removal, port ranges | Add project; Settings General, Workspace, Data; setup wizard | `project.*`, `bootstrap.start`, file operations | Mapped. Config location and machine identity intentionally forked. |
| Single agent tasks, model/config picks, advisor | New task; composer; agent options | `task.create`, `session.setConfigOption`, advisor on task creation | Mapped; initial prompt regression repaired. Advisor RPCs themselves are agent tools. |
| Orchestrator and child sessions | New task Orchestrator; Steps; session switcher | task tags, orchestration graph, `task.cancel`, orchestrator MCP calls | Mapped. Real orchestrator/worker execution was verified in the earlier to-do E2E report. |
| Factory, workflows, barriers, verification | New task Factory; Workflows; Backlog Factory; Inbox; Steps | `workflow.*`, `runner.*`, task factory settings | Mapped. Copy/eject, edit, queue, retry, limits, pause/resume, decisions, evidence remain wired. Backlog batches use item prompts, as in the original. |
| Conversation and prompt queue | Task Conversation; queued message panel | `session.prompt`, interrupt/edit/removeQueued, history | Mapped; mid-turn Send and attachment regressions repaired. Saved history uses shared `loadSessionHistory`, not a direct page RPC. |
| Session continuation and cross-agent branching | Sessions; new-task saved sessions; message Continue; task menu | `sessions.list`, `task.resume`, `session.branch`, fork | Mapped. Fork is an addition. |
| Task title, settle, archive, delete, PR status | Task/board menus; title editor; done shelf | `task.*`, pull-request sync, task-origin helpers | Mapped; automatic naming repaired. Manual regeneration remains available. |
| Changes, commit, push, PR creation | Changes; commit box; Push dialog | `diff.*`, `git.*`, text generation | Mapped. Includes amendment/last message, branch controls, ignored files, hunk actions, roots, and git scope. External push/PR mutations were not repeated for this audit. |
| Shelf and stash | Changes Shelf/Stash; bundle lists; palette | `shelf.*`, `stash.*` | Mapped. Get/drop use dynamic method names, so a literal-call-only scan would falsely flag them missing. |
| Worktree lifecycle | Changes Worktrees; setup-log dialog; merge/reclaim dialogs | `worktree.*`, `task.mergeWorktree` | Mapped. Includes reclaim/orphan removal and setup logs. |
| Files, editing, search, LSP | Files; Quick open; editor settings | `file.*`, `lsp.*` | Mapped. CRUD, ignored files, search, native language-server support remain connected. |
| Runtime services, logs, port forwards | Services; runtime menus; terminal drawer | `service.*`, `portforward.*`, terminal client | Mapped. Service controls and command scopes were exercised in the preceding Chrome E2E report. Kubernetes forwarding requires a usable local cluster. |
| Terminals and command runner | Drawer; sidebar command field | `terminal.*`, daemon buffer/events; `shell.*` | Mapped. `clearTerminalBuffer` is shared client infrastructure; its absence as a direct new page call is not a lost action. Shell command discovery/run are additions. |
| Agent installation, enablement, defaults, accounts, usage | Agents; Settings Agents; defaults and account controls | `agents.*`, `accounts.*`, limits/spend | Mapped. Detection/install/update/probe use the retained services. Custom commands remain configuration-driven. Account rename exists in the backend but neither original nor replacement UI exposes it. |
| GitHub/Linear trackers and backlog | GitHub; Backlog; Settings Integrations/Issue tracker | `tracker.*`, `workItem.*`, `backlog.*` | Mapped. Lists/detail/diff/commits/checks/review/comment/assistant and external issue links remain wired. Network-authenticated writes were not performed. |
| Scheduled automations | Automations; schedule/trigger dialogs; run output | `automation.*` and live events | Mapped. Create/edit/delete/run-now/history and triggers remain wired. |
| Shared memory, edges, dreaming proposals | Memory; Settings Memory; palette | `memory.*`, shared client | Mapped. List/search/edit/delete, relationships, embedding settings, dream/approve/reject remain wired. No real user memories were modified. |
| Docs and project channel | Docs; Channel | `docs.*`, `channel.*` | Additions; not upstream losses. |
| Attention, native notification actions, quit | Inbox; task notices; app startup; Quit dialog | session permissions, native notifications, `app.quit*` | Mapped. Native-only interaction was not executed in Chrome. |
| Native in-app browsing and agent browser tools | Task Browser; startup bridge | browser native commands; `client.register/reply`; daemon origin gates | Agent bridge repaired. Browser-mode external browsing remains the fallback, matching native-only capability boundaries. |
| App updates | Settings Help/update controls | fork updater | Intentionally disabled until OrchestrAI has its own signed feed. This is an unavailable upstream feature, not full parity. Re-enabling Warpforge’s feed would replace the fork. Agent package updates are separate and remain supported. |

## Backend capabilities without original UI actions

Some methods are server/internal/MCP or retained compatibility APIs rather than
missing replacement controls: state/runtime snapshots, handshake, client
registration/replies, advisor asks/waits, orchestrator inbox/agent listing,
memory storage, bootstrap config/finalization helpers, external work-item listing,
and orchestration configuration APIs. Existing shared client helpers also serve
history, agent discovery, and connection setup indirectly.

The inherited `orchestrate.cancel` implementation is a no-op in
`src/daemon/server/dispatch/orchestration.rs`; upstream has the same behavior.
The task-driven UI uses `task.cancel`. API retention must not be interpreted as
proof that this older orchestration endpoint performs cancellation.

## Validation

- New frontend: **345 tests in 124 files passed**, lint/typecheck passed,
  production build passed (existing large-chunk warning).
- Retained frontend: lint/typecheck passed (existing lint warnings);
  **10 attachment/image validation tests passed** after extraction.
- Rust: `cargo fmt --all -- --check` and strict clippy passed. Backend source
  was unchanged by these fixes; the prior 950-test result is recorded in the
  command/settings E2E report, not claimed as a fresh run here.
- Chrome: initial @ completion/context delivery; enabled mid-turn Send;
  queued message visibility/edit/force-send/delivery; automatic naming;
  unchanged demo checkout; restored settings; test-task cleanup.
- Native bridge: four handler tests, startup wiring, and production build.
  No live native WKWebView action was performed in this audit.

Evidence is in the task’s `ui-parity` artifact folder: `inventory.json`,
`task-results.json`, `initial-prompt.png`, `queued-follow-up.png`,
`queue-result.png`, and `automatic-title.png`. Earlier to-do and
command/settings reports contain the broader live application coverage.

## Reproduction

From the repo root:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cd desktop-next
bun run lint
bun run typecheck
bun run test
bun run build
cd ../desktop
bun run lint
bun run typecheck
bun run test src/lib/fileAttachments.test.ts src/lib/imageAttachments.test.ts
```

For the upstream method-set comparison, clone the pinned upstream into a
temporary folder, then extract `#[serde(rename = "…")]` values from each
`crates/warpforge-protocol/src/method.rs` and compare the sets. The saved
inventory includes all method names and exact baseline hashes.

To reproduce Chrome queue coverage: start a Single task in a disposable
checkout, ask it to read an @file then run `sleep 45`, send a correction while
Running, edit its queue entry, press Send now, and verify the edited correction
appears in the transcript and its reply arrives. Do not confuse the deliberately
interrupted shell tool’s failed status with failure of the queued turn.

## Known limitations and remaining work

- Live multi-file upload automation was blocked because Chrome’s ChatGPT
  extension lacks Allow access to file URLs. Multiple-selection support was
  observed; payload and validation tests passed. No extension access setting
  was changed. Picking/dropping/pasting files still needs live verification.
- Native agent browser repair needs a packaged/native smoke run against a
  managed localhost service: navigate, snapshot, click/type, screenshot,
  disallowed-origin prompt, and background-tab adoption.
- GitHub/Linear authenticated writes, account switching, Kubernetes forwarding,
  OS notifications/quit, and app-update installation were source-traced but
  were not freshly executed. App updates remain deliberately off.
- This is a parity audit, not a production security, performance, exhaustive
  input, responsiveness, or empirical agent-reliability assessment.
- Future upstream changes after the pinned commit require a new comparison.
