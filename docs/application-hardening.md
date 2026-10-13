# OrchestrAI application hardening

Date: 2026-10-12 (checks finished 2026-10-13 UTC).
Baseline: `4487d7c`, the published Warpforge UI parity fixes.

## Outcome

The replacement UI retains the backend feature surfaces recorded in the earlier
[parity audit](ui-parity-audit.md). This pass repaired confirmed failures in task
lifecycle, Git/file mutations, draft ownership, native browser lifecycle, live
logs, and Memory searches. It also reduced the production entry JavaScript from
3,225.45 kB to 970.18 kB by loading pages on demand.

The assessment is GREEN for the repaired, tested paths. It is YELLOW for release
operations and third-party writes that were not exercised. “State of the art”
is a product ambition, not a certification supplied by passing tests.

## Cross-cutting findings

Three patterns explain most of the failures:

- Asynchronous acknowledgement was confused with completed work. Hunk rejection
  replied before the mutation finished; legacy cancellation reported success
  without stopping anything; a delayed Send cleared a newer draft.
- State outlived its owner without retaining the owner's identity. Drafts,
  context chips, searches, browser tabs, and pending replies needed explicit
  project/task/checkout/request ownership.
- Optimistic fallback concealed failure. Binary reads became empty editor text,
  unsupported workflow attachments disappeared, and older snapshots replaced
  newly streamed logs.

The remedies retain existing wire methods and delegate blocking filesystem/Git
work to workers. They add explicit failure, completion, and scope checks around
existing operations rather than creating a second source of backend state.

## 1. Agent, Orchestrator, and Factory lifecycle

Assessment: GREEN for ordered dispatch, archive, retry, and listing; YELLOW for
unsupported legacy group cancellation.

### Findings and remedies

- **H01 / P1:** Rapid follow-ups during resumed-session startup overwrote the one
  pending prompt. A per-start ordered queue now retains each follow-up and its
  attachments until capabilities are available. Replies track their own delivery.
- **H02 / P1:** Archive changed task status while active agents, pending starts,
  queued Factory entries, or deeper descendants could continue. Archive now walks
  the full descendant tree, cancels/removes sessions and pending dispatch, removes
  runner entries, clears permissions/wakes, and settles the tree.
- **H03 / P1:** Retrying a blocked start lost newly supplied attachments. Retry
  merges retained and new context, validates aggregate limits, and retains the
  blocked start if the combined request is invalid.
- **H04 / P1:** Listing orchestration runs awaited the orchestration actor inside
  the daemon actor, deadlocking when it called back to create a task. The reply is
  now forwarded without blocking the daemon mailbox.
- **H05 / P2:** Legacy `orchestrate.cancel` acknowledged a no-op. It now returns
  an explicit unsupported error. Individual task cancellation and the workflow
  controls remain available. A real group-stop acknowledgement would require
  wiring the legacy graph actor to those lifecycle controls.

- **H27 / P1:** An unsupported image on a healthy session was treated as a dead
  channel, restarting the agent and acknowledging a prompt it could not accept.
  Capability rejection now returns an error without disturbing the live session,
  its process, or its queued text.

### Evidence

`actor/tests/archive_tasks.rs`, `orchestration_read.rs`, and
`tests/sessions/{reconnect_queue,retry_context}.rs` reproduce the failures.
Eleven new lifecycle regressions pass. Archive tests verify actual mock-agent PIDs
are reaped, including pending starts and descendants, rather than checking status
alone. Existing sessions (15), workflow controls/verification (19), and worktree
startup (8) coverage also passed.

The live Chrome Single task read the disposable project's README and returned
“Quality check ready.” It used the detected Codex configuration. This does not
measure the quality or throughput of every provider or Factory template.

### Preserve

GREEN: deterministic workflows, explicit queued-turn identities, quota gating,
and worktree isolation. The highest-value repairs are ordered startup follow-ups,
complete archive teardown, and attachment-preserving retries.

## 2. Checked commits and change rejection

Assessment: GREEN for tested Git semantics.

- **H06 / P1:** Committing checked paths included unrelated pre-staged changes.
  Selected commits now use literal pathspecs and Git's selected-path semantics,
  preserving the unrelated index. Selective amend, rename sources, additions,
  tracked deletions, and first commits are covered.
- **H07 / P1:** Empty selections could mean all changes. The backend rejects an
  explicit empty selection. The replacement UI always names its checked paths;
  it never substitutes an implicit all-files request because every visible row
  happens to be checked.
- **H08 / P1:** Hunk rejection returned enqueue success and swallowed the real
  result. The response now waits for the worker and propagates failure. Bulk
  operations can await each reverse-index rejection in sequence.

Evidence: 12 scoped commit tests and mutation RPC regressions pass. Live Chrome
selected only `a.txt`, committed it, and displayed “Committed.” Inspection of the
fixture's resulting Git tree showed only `a.txt` in that commit; `b.txt` remained
staged. The initial fixture lacked a Git identity and produced a visible error;
configuring identity only in that disposable repository allowed retry.

GREEN: Git commands continue to run off the daemon actor. Preserve that boundary.
The top repairs are selected-index isolation, explicit empty-selection refusal,
and truthful mutation completion. See [ADR 0032](adr/0032-safe-file-and-git-mutations.md).

## 3. Files, Docs, and checkout ownership

Assessment: GREEN for scoped reads, drafts, and guarded writes.

- **H09 / P1:** Non-UTF-8 and NUL-containing files appeared as empty editable
  text, permitting destructive saves. Text reads now fail explicitly; writes
  revalidate existing bytes. New files and image previews still work.
- **H10 / P1:** Docs writes bypassed the guarded file-save path. They now use
  the same binary and project-path checks, including external symlink targets.
- **H11 / P1:** Document indexing followed external symlink directories or cycles.
  Indexing skips symlinks and special files; listing/writing runs on workers.
- **H12 / P1:** Late diff/root replies and selection state crossed checkout
  boundaries. Page identity and request gates now scope the view to its actual
  project/task/worktree. Older refreshes cannot replace newer results.
- **H13 / P2:** File-list/search replies crossed scope or query changes. Gates
  discard old results and invalidate pending results when search is cleared.
- **H14 / P1:** Leaving Docs discarded unsaved edits; saves could overwrite the
  bookkeeping for newer edits. Docs shares the existing path-scoped draft store,
  retains drafts on navigation, and acknowledges only the submitted saved text.
  A failed read disables saving while retaining any draft for reopening/retry.

Evidence: 17 file/path/binary tests, five server mutation/document tests, and
seven deferred-response file/diff/document component tests pass. In Chrome,
editing README, opening Board, and reopening Docs retained the exact unsaved
text. Save succeeded and disabled the save control after acknowledgement.

GREEN: reuse the existing file draft contract from ADR 0031. The top repairs are
binary overwrite refusal, real path confinement, and scoped asynchronous results.

## 4. Messages, attachments, and keyboard interaction

Assessment: GREEN for tested task ownership and failure handling.

- **H15 / P1:** Typed messages and selected uploads vanished when closing a page.
  Text is task-keyed in session storage; uploads stay task-keyed in memory.
- **H16 / P1:** Remounting during Send reset the local busy flag, allowing a
  duplicate send and deletion of newer draft text/uploads. Sends now have
  transient task tokens. Completion acknowledges only matching submitted text
  and upload identities; remount retains the lock.
- **H17 / P1:** Context/diff chips and delayed composer inserts could be delivered
  to another task. They retain task ownership. Failure restores only the consumed
  chips alongside other tasks' context; removal clears retained task state.
- **H18 / P1:** Workflow question/resume/extend requests silently discarded
  attachments. They reject before any request and keep the draft. Normal prompts
  and completed implementation-stage handoffs still forward attachments.
- **H19 / P2:** Mention/command rows handled pointer-down only, making keyboard
  activation ineffective. Activation now uses click while preserving focus.
  New-task attachment actions are disabled during an in-flight submission.

- **H28 / P1:** Leaving during file reading lost selected uploads; removing a
  task could let a delayed read restore its files. Pending reads, busy state,
  serialization, and generations now belong to the task. Navigation retains
  them; Clear/removal invalidate them.
- **H29 / P1:** Switching from element selection to Conversation unmounted the
  only screenshot listener. Capture ownership now lives outside the browser
  pane. Pending captures hold Send until completion or explicit failure; late
  shots cannot recreate removed context.

Evidence: deferred Send unmount/remount tests retain newer text/uploads and
prevent duplicate requests. Failed-send context restoration and workflow delivery
branch tests pass. Upload tests cover multiple files, task/page isolation, and a
late file read after Clear. Chrome retained the typed message after reopening
its task and reloading the page. Automated Chrome uploads hit the extension's
missing file-URL permission; no permission was expanded.

GREEN: existing batch attachment validation, aggregate limits, and safe text
rendering remain intact. The top repairs are snapshot acknowledgement, task
ownership, and explicit attachment refusal. See [ADR 0033](adr/0033-scoped-pages-and-persistent-drafts.md).

## 5. Native browser and runtime logs

Assessment: GREEN for native actions exercised below and regression coverage.

- **H20 / P1:** Reusing a hidden native view changed its bounds but left it hidden.
  Restoring a browser view now applies navigation, placement, and visibility
  separately, preserving page state when no navigation was requested.
- **H21 / P2:** Closed or removed task/project views could survive or be restored
  by delayed opens. Registries have ownership generations, pending opens are
  coordinated, and native task-prefix teardown releases owned views.
- **H22 / P1:** Disconnects/timeouts left browser client requests alive. Abort
  controllers now cover cancellation, local deadlines, disconnect, and disposal;
  later native actions and replies check cancellation.
- **H23 / P2:** Log refresh replaced newer streamed lines with an older snapshot.
  Snapshots now merge by sequence, remain bounded, and discard stale fetches.
  Reconnect resets generations and old runtime streams.
- **H30 / P2:** An initial navigation before service startup left no document
  for native Reload. Reload/Retry now navigate to the requested address when
  the native view is blank, while loaded and redirected pages retain their own
  reload target.
- **H31 / P1:** Reading an empty native browser's address reached an upstream
  nullable-URL unwrap and could abort the app. The macOS bridge now reads the
  nullable WKWebView address safely, with a bounded worker wait. Agent actions
  on an unloaded document return an error.

Evidence: 19 browser/client frontend tests, 21 shared-client tests, and 43 native
Rust tests passed. A temporary QA app loaded production assets and reused only
the isolated daemon. Through the native UI, the disposable web service became
Running. Its Todo page loaded in WKWebView, accepted typing/clicking, and retained
its input and result after navigating to Memory and reopening the task.

The real daemon → native client bridge also performed Navigate, Snapshot, Type,
Click, and Console. Snapshot confirmed the typed Todo result; Console returned
an empty message list. The agent-created tab became visible in the task pane.

Native element picking returned to Conversation with the selected Add todo
button and its cropped screenshot attached. The screenshot remained available
after the browser pane unmounted.

For failed-load recovery, an uncached local address first produced a blank
native document with the service stopped. After service startup, Reload loaded
the requested Todo page without changing its address or closing the app.

GREEN: origin approval remains daemon-owned and native pages remain client-owned.
The top repairs are visible restoration, owner cleanup, and cancelled-operation
suppression. Real external-origin approval was not exercised.

## 6. Memory and page loading/recovery

Assessment: GREEN for tested response ordering and measured bundle size.

- **H24 / P2:** Older Memory search/filter replies replaced newer results, and
  pagination appended rows from a prior filter. Query/scope/kind gates now cover
  rows and paging; paging is serialized, stale callbacks/results/errors are
  discarded, and refreshed counts/proposals retain their latest generation.
- **H25 / P2:** The entry eagerly loaded all feature pages and editors. Seventeen
  pages now load dynamically. The measured minified entry dropped from 3,225.45
  kB (gzip 1,015.11 kB) to 970.18 kB (gzip 277.52 kB): about 70% and 73% respectively.
  Editor and feature chunks still download when used; this is an entry-size
  comparison, not a total-download or time-to-interactive benchmark.
- **H26 / P2:** A page failure could replace the whole app. Pages have contained
  boundaries and retry controls; shell navigation remains usable. Scope changes
  also reset the boundary for the newly selected context.

Evidence: ten deferred Memory tests, scope-key tests, and a crash/retry DOM test
pass. Production builds pass and report the chunk sizes above. Existing large
on-demand editor/diagram chunks still trigger Vite's size warning.

GREEN: automations already protected request generations; integrations use
app-global statuses rather than project-local caches. Preserve those contracts.
The top repairs are stale-result refusal, on-demand pages, and contained recovery.

## Completed remediation order

| Priority | Work | Effort | Result |
| --- | --- | --- | --- |
| 1 | Agent dispatch/archive/retry, selected commits, guarded writes | M | Implemented and regression tested |
| 1 | Task drafts, scoped context, Send acknowledgement | M | Implemented and component tested |
| 2 | Native restoration/cleanup, cancellation, stream merging | M | Implemented; native smoke passed |
| 2 | Checkout/search/Memory races | S | Implemented and deferred-response tested |
| 2 | Page loading and crash recovery | S | Implemented; build comparison recorded |
| 3 | Release signing/update feed, external provider/platform journeys | L | Requires deployment/platform context; outside this local repair |

## Reproduction

Use Bun from PATH; on this host its executable is `/Users/dev/.bun/bin/bun`.

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo test --locked -p warpforge-protocol
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml
cargo clippy --locked --manifest-path desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path desktop/src-tauri/Cargo.toml -- --check
cd desktop-next
bun run lint
bun run typecheck
bun run test
bun run build
cd ../desktop
bun run lint
bun run typecheck
bun run test src/lib/fileAttachments.test.ts src/lib/imageAttachments.test.ts
cd ../packages/daemon
../../desktop-next/node_modules/.bin/vitest run
```

Final suites: 978 daemon/app Rust tests, 52 protocol tests, 43 native tests,
395 replacement-UI tests, 21 shared-client tests, and ten legacy attachment tests.
Total: 1,499 passing tests. Formatting, strict Clippy, both frontend typechecks,
replacement-UI lint, legacy lint, and production/native builds passed. Legacy lint
retains existing warnings; the replacement-UI lint has no warnings.

To repeat live coverage, create a disposable Git repository with `.orchestrai/
workspace.yaml` containing a `name` and a localhost web service. Use a separate
`ORCHESTRAI_HOME`, register it, and start the rebuilt daemon in development mode.
Start Vite on localhost:5174 for Chrome. For a standalone native smoke bundle,
build the frontend first, then build the native crate with `--features
tauri/custom-protocol` to embed those completed assets. A plain Cargo debug build
is not a substitute for the Tauri CLI's dev setup. Never stop the user's existing
daemon or overwrite their project while preparing fixtures.

## Known limitations

- An existing pinned-port restart test failed once in a concurrent full run with
  a port-in-use error, then passed alone and in the full rerun. Its timing
  sensitivity remains recorded; the pass does not erase the earlier failure.

- Legacy orchestration group cancellation is explicitly unavailable; its former
  false acknowledgement is fixed. Individual task/workflow controls are tested.
- Automatic Chrome multi-file upload needs the browser extension's file-URL
  permission. Multiple uploads and validation passed component/unit tests.
- Native Navigate/Snapshot/Type/Click/Console, visible tab adoption, and element
  screenshot handoff were live tested. External-origin prompts, OS
  notifications/quit, and task/project native teardown were not live tested;
  teardown has regression coverage.
- GitHub/Linear authenticated writes, real Kubernetes forwarding, provider account
  switching, and update installation were not repeated against external accounts.
  The disposable fixture intentionally has no GitHub remote, so its count retry
  control is an expected integration error rather than a tested hosted journey.
- App updates remain deliberately disabled pending a signed OrchestrAI feed.
  This work does not provision release credentials or publish an installer.
- This is a local correctness and reliability pass, not a penetration test,
  accessibility certification, load test, cross-platform release validation, or
  empirical model-quality evaluation. Factory/Orchestrator engine regressions
  passed; a complete live generated application was not rerun in this pass.
- Uploads/chips persist across page changes within a window, not a full reload.
  Typed text survives a reload within the same browser session.
- Future upstream changes require a fresh comparison with a pinned upstream SHA.
