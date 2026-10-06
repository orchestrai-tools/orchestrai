# Capability inventory

Everything Orchestrai can do today, as inherited from Warpforge 0.23.0, read from the source on 1 October 2026. It covers the desktop app, the daemon and its protocol, the agent-facing MCP tools, the CLI and TUI, the config files, and what the docs and website claim. A last section lists what `docs/product/` plans but the code does not have yet.

The revamped shell mock in `experiments/orchestrai-shell` is built from this list. The crosswalk below says where each capability lives in that shell, so nothing is dropped when the abstraction changes to projects.

**Status words used below**

| Word | Meaning |
| --- | --- |
| Shipped | In the code and reachable from the app or CLI. |
| Partial | Some of it exists; the gap is named. |
| Planned | Described in `DECISIONS.md` or `BACKLOG.md`, not in the code. |
| Stub | Declared in the protocol but does nothing. |

**Sources.** Desktop: `desktop/src/**`, `desktop/src-tauri/**`. Daemon and protocol: `src/daemon/**`, `crates/warpforge-protocol/**`, `desktop/src/protocol/**`. CLI and TUI: `src/main.rs`, `src/app.rs`, `src/tui/**`. Docs: `README.md`, `CHANGELOG.md`, `docs/adr/**`, `www/**`.

---

## Crosswalk: today → the project-first shell

In the shell, a **project** is the top-level namespace. It is a tab (or a dropdown entry) in the window's title bar. Everything else lives inside it.

| Today (Warpforge) | Where it lives in the shell | Notes |
| --- | --- | --- |
| Sidebar project tree, project page | Title-bar project tabs or dropdown | One project per tab; each tab remembers its page. |
| Mission Control (Live, Needs you, Failed, Pinned) | **Home** (pinned first tab, every project) + **Board** (per project) + **Inbox** | Home shows what waits on you and every task across projects; opening one jumps into its project. Columns run Needs you → Running → In review → Done. Pinned grid becomes Sessions → Grid. |
| Task detail (conversation + surface rail) | **Task** page + inspector + terminal drawer | Conversation, Plan, Steps in the center; Details, Changes, Checks, Context, Receipts in the inspector. |
| Inbox (PRs) | **GitHub** page | Pull requests and issues side by side (ORC-15). |
| Attention toasts, permission toasts, decision queue | **Inbox** page + title-bar count | One inbox for every approval and question (Antigravity). Toasts become edge marks. |
| Project surfaces: Backlog, Pull Requests, Explorer, Runtime, Terminal, Worktrees | Backlog, GitHub, Docs/Changes, Services, terminal drawer, Changes → Worktrees | Explorer splits: markdown goes to Docs, code diffs to Changes. |
| Automations view | **Automations** page | Trigger → creates a task (Cezar). |
| Workflow templates (YAML) | **Workflows** page | Recipe is separate from a run. |
| Memory view + proposals | **Memory** page | Scope: global, project, task. |
| Settings overlay (Appearance, Agents, Integrations, Tasks, Memory, Advanced) | **Project settings** page + app group; **Agents** page | Project-scoped settings first, app-wide second. |
| Quick Open (⌘P), Find in Files (⌘⇧F) | **Command palette** (⌘K, ⌘P) | One palette with every action and its shortcut. |
| Terminal surfaces (xterm grid) | **Terminal drawer** (bottom, 28 px strip) | Sinew's drawer; command blocks with exit codes (Warp). |
| — | `$` **command bar** (sidebar bottom) | Planned (ORC-24): shell commands only, scoped to the worktree. |
| — | **Docs** page | Planned (ORC-03/04): plans, transcripts, wiki as rendered pages with an editor. |
| — | **Sessions** page | Planned (ORC-05): every ACP session, continue and fork. |
| — | **Channel** page | Planned (ORC-25): humans and agents in one room. |

---

## 1. App shell (desktop)

**Window.** One Tauri window, 1360×860 default, 900×600 minimum, overlay title bar, transparent webview, native glass on macOS (blur) and Windows (Acrylic). A 28 px drag strip holds the traffic lights. A boot splash fades after mount. Shipped.

**Sidebar** (`components/Sidebar/`). Shipped.
- Brand row: wordmark, daemon connection dot, collapse button.
- Segment picker: **Tasks** | **Inbox** (unread PR count).
- **New task** button (⌘N).
- Global nav: **Mission Control** (attention count), **Automations**, **Memory**.
- Body: virtualized project → task tree, or the PR inbox list.
- Task row actions: remind later (snooze presets), mark handled (settle), wake now, pin, archive, delete, Factory items, archive and remove worktree for merged PRs.
- Project row: expand, open project, bulk-settle finished turns.
- Done shelf: "N done", delete shelf.
- Footer: app update banner, agent update banner, Settings, update control.
- Collapsed rail (56 px): expand, new task, segments, nav, live task chips.
- Resizable 260–480 px. Hidden below 1024 px window width.

**Header** (`components/AppHeader.tsx`). Breadcrumb `project / title`. With a task open: inline title editor, worktree chip, PR chip, task menu. With a project open: project switcher with Add project. Shipped.

**Overlays.** Push dialog, Quick Open, Find in Files, PR assistant lifecycle, agent updates, Add project, Settings, quit confirmation, agent setup, bootstrap wizard. Shipped.

**Global shortcuts.** Shipped.

| Shortcut | Action |
| --- | --- |
| ⌘N | New task |
| ⌘\ | Toggle sidebar |
| ⌘P, double Shift | Quick Open (files, symbols) |
| ⌘⇧F | Find in Files |
| ⌘+ / ⌘− / ⌘0 | UI and mono font size |
| ⌘T | Git pull (task open) |
| ⌘⇧K | Push dialog (task open) |
| ⌘K | Open the commit box (task open) |
| ⌘1–⌘7 | Task surfaces |
| ⌘L | Send selection to chat (editor, logs); focus URL bar (browser) |
| ⌘S | Save file |
| ⌘Q | Quit with confirmation |
| Escape | Close settings, new task, palettes |

**Toasts and notifications.** Sonner toasts bottom-right (attention, permission, project added, automation run, git operations, dreaming). macOS notifications with Approve, Reject, Review buttons (`notify_attention`). Shipped.

**Connection.** Spinner and "Connecting to daemon…" until connected; error state. Demo mode with `?demo`. Shipped.

**Onboarding.** Agent setup dialog on first run (`pendingAgentSetup`). After adding a project, a toast offers the bootstrap wizard. No landing page or step-by-step first run. Partial (ORC-22, ORC-23 planned).

**Themes and type.** Eight themes (Forge, Paper, Old Money, Ivory, Forest, Moss, Midnight, Sky). Radius token `0.375rem`. Geist and Geist Mono. Font scale settings. Glass opacity and blur. No density setting. Shipped.

---

## 2. Projects

**Registry.** `~/.orchestrai/projects.json` with name, path, added date, sticky and override port ranges. `ORCHESTRAI_HOME` overrides the data directory. Shipped.

**RPCs.** `project.add`, `project.remove` (optionally stopping resources), `project.setPortRange`. Events `project.added`, `project.removed`, `project.configChanged`. No list RPC; projects arrive in `state.snapshot`. Shipped.

**Workspace config.** `.orchestrai/workspace.yaml` only; stock Warpforge files are not read (ADR 0030). Personal overlay `workspace.local.yaml` (0.23.0), with "local" badges and a config error when invalid. Keys: `name`, `services.<name>.{command, port, env, healthcheck, readyPattern, readyTimeout, dependsOn, portFallback}`, `ports.range`, `portforwards[]`, `agentTemplates`, `worktree.{copy, setup}`. Auto-generated on add from `package.json` and Docker Compose. Shipped.

**Ports.** 100-port block per project from 4000. Sources: auto, sticky, declared, local override. Conflict card when two projects collide. `${svc.port}` and `$PORT` interpolation. ADR 0006. Shipped.

**Project page** (`views/Projects.tsx`). Header with name, path, port range, source chip, conflict card. Menu: Edit (disabled), Factory settings, Stop all Factory tasks, Remove project. **New work item**. Surfaces: Backlog, Pull Requests, Explorer, Runtime, Terminal, Worktrees, each remembered per project. Remove dialog shows live service, port-forward, and terminal counts. Shipped.

**Add project dialog.** Folder path with Browse, optional name, optional port range. Shipped.

**Bootstrap wizard** (`components/BootstrapWizard.tsx`, `bootstrap.start/finalize/readConfig/writeConfig`). Agent choice, runtime kind (local, docker-compose, kubernetes, mixed), compose or k8s paths, dev commands, notes. An agent task writes and validates the YAML. Shipped.

---

## 3. Tasks

**Create** (`views/NewTaskDialog/`, `task.create`). Full-area surface titled "What are you trying to ship?". Shipped.
- Modes: **Single**, **Orchestrator** (lead + workers, no worktree), **Factory** (workflow required, deliver and location options, batch from backlog).
- Options: project, harness, model and config (`AgentConfigBar`), advisor (single mode), worktree toggle and base branch (branch, origin, existing branch, pull request), include running services as context, tags, attachments, run preview.
- RPC fields: `prompt, agent, tags, include_runtime_context, worktree, worktree_base, parent_task_id, attachments, default_model, config_overrides, workflow, backlog_item_id, origin, start, advisor, factory`.

**Statuses.** `queued`, `running`, `waiting`, `blocked`, `interrupted`, `done`. Blocked kinds: `session_lost`, `model_mismatch`, `checkout_held`. Shipped.

**Lifecycle.** Cancel, archive (optionally removing the worktree), delete, delete all settled, set title (auto-named by text generation), settle and unsettle, snooze and unsnooze, pin to Mission Control. Shipped.

**Task detail** (`views/TaskDetail.tsx`). Shipped.
- Conversation pane (agent switcher for orchestrator and workers, pane focus, hide, flip side) and workspace pane, resizable.
- Banners: limits exhausted, session lost, model mismatch, PR feedback.
- Surface rail: Conversation, Explorer, Diff, Runtime, Terminal, Browser, Pipeline (⌘1–⌘7).
- Status strip: account and quota, advisor chip, pull and push progress, branch menu (sync ⌘T, commit ⌘K, push, new branch ⌥⌘N, merge worktree, branch search).
- Task menu: pin, archive, delete.

**Queued prompts.** Messages typed while the agent works are queued; send all now, edit, remove (0.20.0, 0.23.0). Shipped.

**Advisor** (ADR 0022). A hidden read-only child session the executor consults (`advisor.ask`, `advisor.wait`, MCP `ask_advisor`). Shipped.

**External sessions.** `sessions.list` scans Claude Code (`~/.claude/projects`) and Codex (`~/.codex/sessions`) on disk; `task.resume` continues one as a task. Partial: other agents are not listed, and fork is not offered (ORC-05).

---

## 4. Agents, accounts, limits, spend

**Known ACP agents** (`src/daemon/agents/mod.rs`). Shipped.

| Agent | ACP command | Install |
| --- | --- | --- |
| Claude Code | `claude-agent-acp --acp` | npm `@agentclientprotocol/claude-agent-acp` |
| Codex | `codex-acp` | npm `@agentclientprotocol/codex-acp` |
| OpenCode | `opencode acp` | npm `opencode-ai` |
| Qwen Code | `qwen --acp` | npm `@qwen-code/qwen-code` |
| Goose | `goose acp` | brew `block-goose-cli` |
| Junie | `junie --acp true` | npm `@jetbrains/junie-cli` |
| Cursor | `cursor-agent-acp` | npm `@blowmage/cursor-agent-acp` |
| Pi | `pi-acp` | npm `pi-acp` |
| Grok Build | `grok agent stdio` | npm `@xai-official/grok` |

Gemini CLI is **not** in the list (tests only). Custom ACP agents can be configured.

**Setup.** `agents.detect` (installed via `which`, version, latest from npm, status missing/current/behind/unknown), `agents.install` (with clean reinstall), `agents.probe` (initialize + `session/new` to read models without a prompt), `agents.update`, `agents.list`. Health from error signatures (`agents.healthUpdated`, broken install). Update checks every 12 hours. Shipped.

**Accounts.** Several logins per agent in vaults under `~/.orchestrai/accounts/<agent>/<slug>/`: `accounts.list/import/rename/remove/setActive`. Credential capture follows token rotation. Shipped.

**Limits.** `listAgentLimits` with five-hour, seven-day, and model windows for Claude, Codex, OpenCode; `agentLimits.updated`. Unattended work is gated on known exhaustion at dispatch (ADR 0019). Shipped.

**Spend.** `listAgentSpend`: today and total USD-equivalent per agent. No push event. Shipped.

**Language servers.** `lsp.detect`, `lsp.install` for TypeScript, Rust, Go, Python, JSON, CSS, HTML, YAML, Elixir. Shipped.

---

## 5. Conversation and composer

**Composer** (`components/Composer.tsx`, `ChatComposer.tsx`). Multi-line input, `@` file mentions, `/` slash commands, attach (⌘⇧A), image and document chips, drag-and-drop file references, context usage ring, send and stop. Shipped.

**Transcript** (`components/SessionChat/`). Virtualized list, collapsible tool activity groups, tool output with truncation, thinking blocks, message actions, queued prompts bar, continue-session dialog, scroll to bottom, skeleton while history loads. ADR 0005. Shipped.

**Session updates.** `user_message`, `prompt_capabilities`, `agent_text`, `agent_thought`, `tool_call`, `file_edit`, `permission_request`, `permission_resolved`, `plan`, `available_commands`, `usage`, `turn_ended`, `workflow_event`, `advisor_consultation`. Full history via `session.history`. Shipped.

**Attachments.** File (path and range), image (png or jpeg), document (extracted text). ADR 0008. Shipped.

**Text generation** (`text.generate`). Kinds: commit message, PR description, task title, shelf name, enhance prompt, handoff. `text.enhance` for backlog prompts. Shipped.

**Turn lifecycle.** One turn at a time per session; every turn records who asked (user, automation, system). ADR 0011. Shipped.

---

## 6. Mission Control

`views/MissionControl.tsx`. Shipped.
- **Live**: a card per running or queued session (tone, elapsed, tools, preview).
- **Needs you**: decision queue with inline approve, deny, retry.
- **Failed**: failed and interrupted tasks.
- **Pinned**: a drag-and-resize grid of focus panes with inline chat and agent switcher (`react-grid-layout`).
- Tab persisted. Excludes PR-assistant shadow tasks.

---

## 7. Approvals and policies

- **Permissions**: ACP `permission_request` → `session.permission` with `allow`, `allow_always`, `deny`. First answer wins (`permission_already_resolved`). Shipped.
- **Daemon asks**: browser origins outside the project ask in the task (`AskUser`). Shipped.
- **Policy engine** (`src/policies/`): phases ToolCall, Spawn, Prompt; verdicts Allow, Ask, Deny; built-in `BlastRadiusPolicy`. Not configurable from the UI. Partial (ORC-10 adds profiles and modes).

---

## 8. Git

**Changes rail** (`components/ChangesRail.tsx`). Tabs **Commit**, **Shelf**, **Stash**. Shipped.
- Commit: staging tree with tri-state checkboxes, per-file diff counts, hunk actions, commit box with amend, AI commit message, shelve, ignored files section, context menu.
- Shelf: named bundles outside the repo (`~/.orchestrai/shelf/`), apply, drop.
- Stash: git stash list, apply, drop, per-file.

**Diff.** Unified and split (CodeMirror merge view), hunk accept and reject (`diff.resolveHunk`), diff notes pinned to hunks. Shipped.

**Branches.** IDE-style branch tree, switch, create, rename, delete, rebase without checkout, merge, update (fetch, rebase, autostash). Shipped.

**Push dialog** (⌘⇧K). Commits to push with files, force push menu, create PR with generated title and body. Shipped.

**Worktrees.** Optional per task under `.orchestrai/worktrees/`; base from branch, origin, existing branch, or PR; `worktree.copy` and `worktree.setup`; merge into base; Worktrees tab with size, orphan removal, disk reclaim, setup log. ADR 0015. Shipped.

**RPCs.** `diff.get`, `diff.resolveHunk`, `git.commit/add/ignore/update/branches/roots/ignored/switchBranch/branchRename/branchDelete/branchCreate/rebase/merge/pushInfo/push/lastCommitMessage/createPr`, `shelf.*`, `stash.*`, `task.mergeWorktree`, `task.listWorktrees`, `worktree.list/reclaim/removeOrphan/setupLog`.

---

## 9. Pull requests and inbox

**Inbox** (`views/InboxView.tsx`, `components/inbox/`). Shipped.
- List: search, Open/All, assigned to me, mark all read, unseen dots, assistant state; `j`/`k` to move.
- Detail tabs: **Overview** (description, commits, checks, reviewers, files), **Diff** (file tree or risk groups, commit range, inline comments, review composer), **Assistant** (an agent working on the PR).
- Review: approve, request changes, comment (⌘⏎); send to an agent with an intent.
- RPCs: `tracker.pulls.list/details/diff/commits/thread/checks/comment/reviewComment/review`.

**Task PR status** (ADR 0020). `task.pullRequests` and `task.pullRequest`: state, checks rollup, failed checks, open review threads; polled through `gh` every 180 s while watched; archive on merge; PR feedback sent back to the task or workflow stage. Shipped.

**GitHub issues page.** Not a page today; issues arrive as backlog work items. Planned (ORC-15).

---

## 10. Backlog, trackers, Factory

**Backlog** (`components/backlog/`). Infinite-scroll list; search; filters by status, priority, assignee, source; sort; Linear team picker; Sync; multi-select; Run in Factory; new and edit drawers; start task; open linked task. Storage SQLite or YAML (`.orchestrai/backlog/`). RPCs `backlog.*`, `workItem.linkTask`. ADR 0002. Shipped.

**Trackers.** GitHub (PAT in keychain or `gh`) and Linear (API key). Connect, disconnect, links, project sources, Linear teams per project, attachment fetch, external work items create, sync, import, list. **No Jira.** Shipped.

**Factory runner** (ADR 0023, 0.23.0). Queue from backlog with workflow, agent, model, run location (worktree, checkout, auto), deliver option; dequeue, reorder, start now, retry, retry checkout, stop, brief, run history. Limits: max concurrent, max open PRs, per day, headroom, minimum free disk. Wait reasons: slots, open PRs, daily, quota, disk, checkout busy, checkout held, invalid workflow. Factory strip on tasks. Shipped.

---

## 11. Workflows and orchestration

**Workflows** (ADR 0001, 0003, 0024). YAML in `.orchestrai/workflows/`; built-ins `review-loop`, `plan-review-loop`, `verify-review-loop`; `workflow.eject` copies one into the project. Stages `plan`, `implement`, `review`, `fix`, `verify`, `done`, `failed`. Multi-reviewer review with `max_rounds` and `on_limit`. Template variables such as `{{task_prompt}}`, `{{diff}}`, `{{findings}}`, `{{round}}`. Barriers ask a person: a stage question (`workflow.reply`) or the review limit (`workflow.decide`: extend, finish, stop). Pause and resume; losing an agent pauses instead of failing. Verify-stage screenshots (`workflow.evidence`, verification report). Workflow events in the transcript. Pipeline surface lists child tasks. Shipped.

**Orchestration.** `orchestrate.start` (goal → planner → workers → reviewers), `orchestrate.list`, config of planner, worker pool, reviewer pool, worktrees (SQLite). `orchestrate.cancel` is a **stub**. Orchestrator-only MCP tools: `spawn_agent`, `list_agent_models`, `read_inbox`, `message_agent`, `list_agents`, `stop_agent`, `cleanup_agents`, `spawn_workflow`, `pause_workflow`, `resume_workflow`, `answer_workflow`, `decide_workflow`. Shipped except cancel.

---

## 12. Automations

`views/Automations.tsx`, ADR 0007. Shipped.
- Card grid with live strip, search, state filter (enabled, paused), last-run filter.
- Create and edit: name, prompt, project, agent, model, schedule (presets hourly, every 5 minutes, daily, weekdays, weekly, custom cron), timezone, precheck command, reuse session, worktree and base, missed-run grace.
- Run now, pause, delete, run history with output.
- Run statuses: pending, running, completed, failed, skipped precheck, skipped missed, skipped running, skipped quota.
- GitHub triggers (issue, label, review): Planned (ORC-13).

---

## 13. Memory

`views/Memory.tsx`, `src/daemon/memory/`. Shipped.
- Store, search (FTS5 BM25, hybrid with local embeddings), list, update, delete, stats.
- Scopes: global and project, with an optional per-project database.
- Graph edges between memories.
- **Dreaming**: compaction proposals to approve or reject; manual or cron trigger; dry run.
- UI: browser with search, scope, kind, tag filters; detail with edit, tags, links, delete; Proposals tab.
- Settings: embedding mode Keywords or Hybrid (~80 MB download).
- Write only after merge: Planned (ORC-17).

---

## 14. Runtime: services and port-forwards

- Services: start, stop, restart, start all, stop all, logs with cursors, filters, context, UTC timestamps. `sh -c` spawn, dependency order, process-group kill, healthcheck, ready pattern, ready timeout, late recovery (ADR 0016), wrong-port warning (`service.portWarning`). Shipped.
- Port-forwards (kubectl-style): start, stop, logs, reuse of a local server, reconnect with backoff. Shipped.
- `runtime.stopAll`, `runtime.list`. Logs can be sent to chat (⌘L, "Send last failure"). Shipped.
- Projects auto-start their services when opened. Shipped.

---

## 15. Terminals

`terminal.spawn/input/resize/kill`; events `terminal.spawned/screen/data/exited`. Desktop terminal workspace on xterm.js, task- or project-scoped. Partial: no command blocks, exit codes per command, or bottom drawer (ORC-07, ORC-08).

---

## 16. Files, editor, search, LSP

- Explorer: file tree, tabs, CodeMirror editor, save (⌘S), create, rename, delete, change gutter, go to line, binary and image preview, markdown and HTML preview. Shipped.
- LSP: go to definition, hover, rename, diagnostics, format, completions (`lsp.start/send/stop`). Shipped.
- Quick Open (⌘P, double Shift): files, symbols, tasks. Find in Files (⌘⇧F) with preview. Shipped.
- Markdown: GFM, Mermaid, alerts, images; editor preview toggle. A docs library with rendered pages and a synced editor: Planned (ORC-03, ORC-04).

---

## 17. Browser

Task browser surface with tabs, address bar, back, forward, reload, element pick and annotations (Tauri child webviews, ADR 0021). Agent browser tools: `browser_snapshot`, `browser_click`, `browser_type`, `browser_navigate`, `browser_screenshot`, `browser_console`; outside origins need permission. Shipped. Chrome cookie import into named profiles: Planned (ORC-21).

---

## 18. MCP tools agents can call

Loopback MCP per ACP session (`src/mcp/`). Shipped.

| Group | Tools |
| --- | --- |
| Runtime | `list_runtime`, `read_service_logs`, `read_portforward_logs`, `service_start`, `service_stop`, `service_restart`, `portforward_start`, `portforward_stop` |
| Backlog | `create_backlog_task`, `create_task`, `list_backlog_tasks`, `get_backlog_task`, `update_backlog_task`, `close_backlog_task` |
| Factory | `runner_enqueue`, `runner_status` |
| Memory | `memory_store`, `memory_search`, `memory_list`, `memory_update`, `memory_delete`, `memory_stats`, `memory_dream`, `memory_list_compaction`, `memory_resolve_compaction`, `memory_addEdge`, `memory_edges` |
| Automations | `automation_create`, `automation_list`, `automation_get`, `automation_update`, `automation_delete`, `automation_run_now`, `automation_runs` |
| Browser | the six browser tools above |
| Orchestrator | the twelve tools in §11 |
| Advisor | `ask_advisor` (advisor sessions get a read-only subset) |

App actions as MCP tools (open terminal, launch agent, switch worktree) are not exposed: Planned (ORC-11).

---

## 19. Settings

Full-screen overlay (`views/settings/`). Shipped.

| Section | Options |
| --- | --- |
| Appearance | Theme (8), UI font size 10–24, mono font size 9–22, transparent window, glass opacity 60–100%, blur radius 1–64, main pane glass, email blur |
| Agents | Agent setup (detect, install, enable, reinstall), accounts and usage |
| Integrations | Language servers, issue trackers (GitHub, Linear) |
| Tasks | Auto-name tasks, agent and model for git text, transcript retention (15/30/60 days, forever), settle ignored after (7/14/30, off), delete closed after (60/90/180, forever) |
| Memory | Embedding mode, status strip, failure warning |
| Advanced | Backlog storage (SQLite, YAML), Dream now per project, dry run |

Persisted UI state (`wf-ui`, version 8): view, last task, selected project, chat and diff pane visibility, diff view, project surface per project, backlog filters per project, Mission Control tab, sidebar width and collapse, panel collapses, inbox filters, theme, font sizes, PR assistant agent and models, text generation agent and model, auto-name, glass settings, settings page, new-task worktree default, branch worktree default, work item drawer size, LSP enabled, pinned tasks and layout. Also panel sizes, chat side, diff notes, PR feedback handled keys, and per-task editor and browser session state.

---

## 20. Native layer (Tauri)

Plugins: updater, process, opener, shell (daemon sidecar), dialog. Commands: `daemon_endpoint`, `quit_app`, `quit_ui_ready`, window blur and glass, `notify_attention`, `withdraw_attention`, `show_context_menu`, thirteen `browser_*` commands, `browser_agent_call`, `browser_agent_screenshot`. Quitting the app stops the daemon it started, not one started from the CLI (ADR 0014). No tray, no global shortcuts, no deep links.

---

## 21. CLI and TUI

**CLI** (`orchestrai`, installed as `orchestrai`). Shipped.

| Command | Does |
| --- | --- |
| `add <path> [-n name] [--ports range]` | Register a project; create workspace config if missing |
| `remove <name>` | Unregister |
| `list` | Projects with port ranges |
| `init [path] [-a]` | Generate workspace config; optionally register |
| `bootstrap [path]` | Interactive config generation through an agent task |
| `ui` (default) | TUI |
| `daemon [--dev] [--owner desktop\|external]` | Run the daemon |

**TUI.** Dashboard (projects with service and agent status) and project view (services, port-forwards, agent terminals). Keys: `j`/`k`, Enter, `a` add project, `s` services, `p` port-forwards, `n` spawn agent, `Tab` and `1`–`9` agent tabs, `Enter`/`i` terminal mode, `x` kill, `R`/`X` restart/stop all, `u`/`x`/`r` per service, `w` wrap, `Esc`, `q`. No tasks, chat, git, or memory. `CLAUDE.md` lists stale keys (`l`, `[`/`]`, `u`/`d`) and a removed file (`src/tui/terminal.rs`).

---

## 22. Data and config on disk

| Path | Holds |
| --- | --- |
| `~/.orchestrai/daemon.json` | Endpoint, token, PID, owner |
| `~/.orchestrai/projects.json` | Project registry |
| `~/.orchestrai/warpforge.db` | Tasks, sessions, agents, accounts, workflows, runs, automations, backlog (SQLite mode), tracker links, orchestrator config |
| `~/.orchestrai/config.yaml` | `history:` retention, `memory:` (embedding, dreaming) |
| `~/.orchestrai/memory.db` | Global memory |
| `~/.orchestrai/accounts/` | Credential vaults |
| `~/.orchestrai/shelf/` | Shelf bundles |
| `<project>/.orchestrai/workspace.yaml` (+ `.local`) | Workspace config |
| `<project>/.orchestrai/workflows/*.yaml` | Workflow templates |
| `<project>/.orchestrai/backlog/*.yaml` | Backlog (YAML mode) |
| `<project>/.orchestrai/worktrees/` | Task worktrees |
| macOS keychain | GitHub PAT, Linear API key |

---

## 23. What the docs and website claim

- Website: "Your agents don't share a workspace. Now they do." Local-first, 8 harnesses, 31 agent tools (the docs overview says 38), LSP, MIT; Homebrew cask and DMG; Apple Silicon first, Linux and Windows preview.
- The tool count disagrees between the landing page (31), the overview (38), and the MCP reference (24 plus extras).
- `www/.../reference/cli.mdx` omits `daemon --dev` and `--owner`.

---

## 24. Planned in `docs/product/`, not in code

| Ticket | What |
| --- | --- |
| ORC-01, 02 | Orchestrai name and data directory; upstream sync policy |
| ORC-03, 04 | Docs library; transcripts and plans as pages |
| ORC-05 | Session board for every ACP agent, continue and fork |
| ORC-06 | Plan pane, approvals pane, scoped memory |
| ORC-07, 08 | Warp process model; Sinew terminal drawer |
| ORC-09, 10 | Skills catalog and `WARP.md` instructions; permission profiles and modes |
| ORC-11 | One action list for palette, control socket, loopback MCP |
| ORC-12 | SSH with one ControlMaster |
| ORC-13, 14 | Task / workflow / automation split with recipe steps; fan-out and non-nesting subagents |
| ORC-15, 16, 17 | GitHub issues page; Shep task ending (stops, CI fix loop, draft PR); memory after merge |
| ORC-18 | Shell truncation and unique-match edit |
| ORC-19, 20, 21 | Phone remote (Sinew relay); WASM plugins; Chrome browser profiles |
| ORC-22, 23 | Helmor first run; landing screen |
| ORC-24, 25, 26 | Panel grid and `$` command bar; Agents page, teams, channels; canvas home |
| Spikes | Berd port, SSH remote agent, voice, Jujutsu, native-CLI wrapper, direct model loop (Zed spike done) |

---

## 25. Gaps and drift found while reading

- `orchestrate.cancel` returns null without cancelling.
- Orchestrator config lives in SQLite, while a comment points at `~/.orchestrai/orchestrator.yaml`.
- Spend has no push event; the desktop polls.
- Several actor commands have no wire RPC: open project, standalone worktree discard, daemon asks, child status, evidence reservation.
- A second ACP server (TCP, `src/daemon/acp_server.rs`) is not described in `desktop/src/protocol/`.
- `CLAUDE.md` names an `AttentionRail.tsx` component that does not exist; the logic is `lib/attentionRail.ts`.

---

## 26. Decisions the shell mock makes

These are the visible changes from today's app. Each follows `docs/design/DESIGN-PHILOSOPHY.md`.

| Change | Why |
| --- | --- |
| The project is the namespace and the title-bar tab | One place per project; each tab keeps its page (TradingView). |
| Mission Control becomes a pinned Home tab across projects, plus a Board per project and one Inbox | Projects are where things live; attention runs across them. Agent work is a board; every approval is in one inbox (§7, §12). |
| Toasts become an inbox count at the edge | Status lives at the edge; only what needs a person comes to the center (§7). |
| Quick Open, Find in Files, and actions merge into one ⌘K palette (⌘P still opens it) | One palette, every action, shortcuts shown (§3, §4). |
| Fixed regions: sidebar, work, inspector, bottom drawer | Stable layout; collapse on purpose (§5, §18). |
| Plans and transcripts render as markdown pages with an editor beside | The person reads more than writes (§1, DECISIONS). |
| Stopped tasks show what they were about to do, what they were unsure about, and the choices to continue | A stop is a handoff (§13). |
| Focus mode on ⇧⌘\; ⌘\ keeps toggling the sidebar | One key in and out; protect Warpforge's existing ⌘\ (§1a, §8). |
| Gemini CLI appears as an agent that needs sign-in | `DECISIONS.md` names it as an ACP worker; Warpforge does not support it yet, so it is shown as planned, not shipped. |
| Density and corner radius are one product-wide setting each; corners default to 4 px | Density is a mode; radius is one token (§18, SHARP-EDGES). |
| **Open:** ⌘K is the palette here but opens the commit box in Warpforge today | Change muscle memory once, on purpose (§8). In the mock, commit is the Changes page's own button and ⌘↵ in its message box. |
