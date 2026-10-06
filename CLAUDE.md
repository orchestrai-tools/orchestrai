
## Project: OrchestrAI (a fork of Warpforge)

Workspace orchestrator with TUI and desktop interfaces. Manages multiple dev projects: isolated services with auto-resolved ports, embedded agent terminals (Codex, Claude), instant context switching.

### Architecture

**Core (Rust):**
- **Language:** Rust
- **Async runtime:** Tokio
- **Daemon:** Background process that manages services, agents, and project state
- **PTY:** `portable-pty` — real TTY for spawned agents
- **Terminal emulation:** `vt100` crate — parses ANSI into screen buffer
- **CLI:** `clap` derive API
- **Config:** `.orchestrai/workspace.yaml` per project (serde_yaml). Stock Warpforge's `.warpforge/` and root-level config names are deliberately not read. Machine data lives in `~/.orchestrai` (`ORCHESTRAI_HOME` moves it), with the registry in `~/.orchestrai/projects.json`. Every on-disk and user-visible name comes from `crates/warpforge-protocol/src/identity.rs` (ADR 0030), so the app runs beside stock Warpforge
- **Port isolation:** each project gets 100-port range (4000+), `${svc.port}` interpolation in env vars
- **Daemon IPC:** WebSocket JSON-RPC (port 61814)

**TUI (Rust):**
- **Framework:** Ratatui + Crossterm
- **Binary:** `cargo build --release` → `target/release/orchestrai`
- **Key crates:** ratatui 0.29, crossterm 0.28 (event-stream), vt100 0.15

**Desktop (TypeScript + Tauri):**
- **Framework:** Tauri v2 (Rust shell + WebView)
- **Frontend:** `desktop-next/` — React 19 + TypeScript + Vite, port 5174. `desktop/src` remains because the website still compiles it.
- **UI:** Tailwind CSS 4 with the shared kit `@warpforge/ui` (`packages/ui`: shadcn components on Radix and Base UI, cmdk, react-resizable-panels, lucide, Geist). Pages use kit components and Tailwind classes only. The layout follows the mock in `experiments/orchestrai-shell`: Home, a sidebar of pages, an inspector rail, and a terminal drawer.
- **State:** Zustand (`orc-shell`, `orc-layout`)
- **Terminal:** xterm.js in the drawer. The file page is a text editor with language-server diagnostics.
- **Package manager:** Bun
- **Linting:** oxlint + oxfmt
- **Tests:** Vitest

**Key crates (Rust):** tokio, clap 4, serde, anyhow, portable-pty 0.8, vt100 0.15, ratatui 0.29, crossterm 0.28

### Source layout (`src/`)

```
main.rs          — CLI entry (clap), subcommands: add, remove, list, ui
app.rs           — TUI event loop (tokio::select), AppState, InputMode (Navigate/Terminal), key handling
agent.rs         — AgentManager: PTY spawn via portable-pty, vt100 parser, input/output channels
service.rs       — ServiceManager: sh -c spawn, stdout/stderr log capture, process-group kill, port allocation
config.rs        — workspace config parsing + auto-detect (package.json scripts, docker-compose)
workflow_config.rs — .orchestrai/workflows/*.yaml templates: schema, validation, prompt rendering
registry.rs      — ~/.orchestrai/projects.json CRUD
ports.rs         — Port range allocation (4000+), ${svc.port} env interpolation
tui/
  mod.rs         — render dispatch (Dashboard vs Project screen)
  dashboard.rs   — Project list with service/agent status, j/k nav, Enter to open
  project.rs     — Split layout: sidebar (services + agents) + right pane (terminal or logs)
  terminal.rs    — TerminalPane widget: vt100 Screen → ratatui Buffer (cell-by-cell, colors, cursor)
```

**Daemon (`src/daemon/`):**
- WebSocket server (port 61814) that desktop/TUI connect to
- Manages agents, services, port-forwards, tasks, git operations
- Key files: server.rs, actor.rs, task.rs, agents.rs, diff.rs
- **workflow.rs** — deterministic workflow pipeline: run state, stage prompts,
  agent protocols. Actor glue is the workflow block at the end of actor.rs.
  Templates are parsed by `src/workflow_config.rs`; see `docs/adr/0001`.

**Desktop source (`desktop-next/src/`):**
```
main.tsx          — React entry, daemon callbacks, demo mode (`?demo`)
App.tsx           — Mounts the shell, the page for the current route, and the app dialogs
shell/            — App shell: title bar, sidebars, worktree switcher, palette, inspector, terminal drawer
pages/            — One file per page plus a folder of its parts (home, board, task, changes, files, …)
components/       — Dialogs shared across pages (new task, setup, push) and `common/` building blocks
lib/              — Shell store, shortcuts, appearance, language server, updater
```

The previous frontend is still in `desktop/src/`. The site imports it. The Tauri window loads `desktop-next`.

**Shared client (`packages/`):**
```
protocol/   — Wire types
daemon/     — WebSocket client
ui/         — Shared UI kit (shadcn components, `cn`, hooks, `styles.css`)
core/       — UI-free helpers (themes, snooze, session timing)
```

### What Works (Rust)

- **CLI:** `orchestrai add/remove/list` — project registry CRUD
- **TUI dashboard:** project list with service status, agent elapsed time, j/k navigation
- **TUI project view:** sidebar (services + agents list) + agent terminal or logs pane
- **Agent terminal:** portable-pty + vt100 renders full-color terminal with cursor, bold, italic, underline, inverse
- **Agent input mode:** `i` enters terminal mode (all keys forwarded to PTY), `Esc` exits
- **Multi-agent tabs:** `Tab` cycles, `1-9` direct switch, `n` spawns new claude session, `x` kills
- **Service management:** auto-start on project open (from .workspace.yaml), `u/d` start/stop individual services
- **Service logs:** `l` toggles logs pane, scroll with j/k, `[/]` switch between services
- **Port isolation:** per-project 100-port ranges, env interpolation
- **Process cleanup:** process-group kill (`kill -9 -<pgid>`) for service subtrees, PTY drop on agent kill

### What Works (Desktop)

The Tauri window loads `desktop-next`. Home, the board, a task conversation, changes, files, GitHub, backlog, workflows, automations, memory, services, and project settings talk to the daemon. Command-K opens the palette. Commit is Command-Return in the commit box.

`desktop/src` is the previous frontend. The website still compiles it.

### Key Design Decisions

**Read `docs/adr/` before changing a subsystem it covers.** Those records hold
the rejected alternatives and the invariants that are not visible in the code —
each entry's *Invariants* section lists mistakes already made once. Add a new
numbered record when you make a decision a future reader could not infer.

- **Ratatui + vt100** for terminal-in-terminal: native cell-by-cell rendering with zero translation layer. Previous TypeScript/OpenTUI attempt couldn't render ANSI properly.
- **vt100 + TerminalPane:** Agent PTY output → `vt100::Parser::process()` → `Screen` → iterate cells with colors/attributes → write directly to ratatui `Buffer`. Cursor rendered via `Modifier::REVERSED`.
- **portable-pty:** Cross-platform PTY. Reader/writer in `spawn_blocking` tasks, input via `mpsc::unbounded_channel`.
- **Process groups:** Services spawn with `process_group(0)` so `kill -9 -<pgid>` kills sh→npm→node tree.
- **Event-driven rendering:** `tokio::select!` on crossterm events + agent PTY data + service log events. No polling.
- **`sh -c "<command>"`** for services — commands can contain pipes, `&&`, `cd`, etc.
- **Navigate/Terminal input modes:** Navigate = TUI keys (j/k/Tab/n/x), Terminal = raw PTY forwarding. `Esc` always exits terminal mode, `Ctrl+C` always quits app.

### Build & Run

```bash
# Rust TUI
cargo build --release
# or during dev:
cargo run

# Desktop (Tauri + React)
cd desktop
bun install
bun run tauri dev

# The window's frontend, without the Rust shell
cd desktop-next
bun run dev
```

### Desktop Commands

```bash
cd desktop
bun run tauri dev    # Full Tauri dev (Rust shell + desktop-next)

cd desktop-next
bun run dev          # Vite dev server only, port 5174
bun run lint         # oxlint
bun run typecheck    # tsc --noEmit
bun run test         # vitest
```

### Before committing

Run the fast CI checks locally — CI rejects on these and it's avoidable:

- `cargo fmt --all -- --check` (or `cargo fmt --all` to fix)
- `cargo clippy --locked --all-targets -- -D warnings`
- desktop changes: `cd desktop && bun run lint && bun run typecheck`

A pre-commit hook (`.githooks/pre-commit`, enabled via
`git config core.hooksPath .githooks`) runs these; do not rely on it — run them
yourself before committing, and never `--no-verify` to dodge a real failure.

Every commit must carry a changeset (`bun run changeset` produces one — add
it in the same commit as the change). Never hand-edit versions or
`CHANGELOG.md` — the **Version release** workflow owns both. See
`docs/RELEASING.md`.

Changeset text is customer-facing release-note copy. Write it for users, not
maintainers or changelog tooling: lead with outcome and product value, explain
how the feature helps and include a shortcut or action when useful. Use plain,
confident language and describe one coherent user-visible improvement per
changeset; combine related implementation commits when they ship as one
experience. Avoid internal names and implementation details such as RPCs,
packages, daemon processes, file paths, protocol names, or compiler flags.
Mention limitations only when they affect what users can do. Never claim
behavior the product does not provide.

Keep commits small and focused, not huge sweeping changes. Each commit should
briefly describe the essence of what changed (one logical change per commit).

### Module layout

Keep source files small — at most 400–500 lines of code per file. That is the
hard maximum; split larger files rather than growing past it.

Enforce it on the way in, not later. `src/daemon/actor.rs` reached 10,504 lines
because every change added "just one more arm" to a file that was already over
the limit. Adding to a file that is already at the cap is the violation; split
first, then add.

When a module outgrows one file, turn it into a directory module — `foo.rs`
becomes `foo/mod.rs` plus siblings — rather than inventing a `foo_extra.rs`
next to it. Split by topic, not by line count: each file should be nameable
after what it does. `mod.rs` keeps the type definition, its constructor, and a
thin dispatcher; the behaviour lives in the topic files. Child modules can read
private fields of a type defined in the parent, so splitting needs only method
visibility bumps (`pub(super)` / `pub(crate)`), never public fields.

The one acceptable exception is a single item that cannot be divided without
rewriting it — a large `enum` with doc comments, for example. Do not split such
an item just to satisfy the line count.

When a large `match` moves out of one file, keep it exhaustive in one place —
a dispatcher whose arms each call a `pub(crate)` method is the safe shape.
Chaining topic handlers by falling through (`other => self.handle_next(other)`)
with a terminal `_ => {}` compiles the same but turns a dropped arm into a
silent no-op instead of a compile error. `src/daemon/actor/` currently uses that
chained shape, so a new `Command` variant must be wired up by hand — the
compiler will not remind you.

### Clean up after yourself

Write scratch files — scripts, dumps, logs, screenshots — under `$TMPDIR`,
never into the repo. Delete the ones you created before reporting a task done.
Leave files you did not create alone; that directory is shared with other
sessions.
