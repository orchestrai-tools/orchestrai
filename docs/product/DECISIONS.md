# Desktop harness decisions

**Date.** 26 September 2026.

The product is a desktop harness for **agentic coding**. The person does not live in source files. They read markdown all day, in volume: agent plans and transcripts, and also wikis and docs, a lot of them. The agent writes the code. The backbone is agents over **Agent Client Protocol** (Zed ACP, JSON-RPC over stdio). It is not IBM Agent Communication Protocol, not MCP-only, and not a custom adapter per CLI.

The primary UI is **markdown, viewed and edited**, not an IDE. Reading is rendered markdown (headings, lists, tables, links, diagrams). Editing is a real markdown editor on those same pages, not a source-code buffer you happen to open a `.md` in. Two piles, both large:

- The agent’s work: plans, transcripts, review prose.
- Wikis and docs: many pages, kept open, searched, and reread.

A code editor for source files can exist for the rare look. It is not the screen that has to be fast or first. Score a repo on whether `.md` wikis, docs, plans, and transcripts have a pleasant rendered view and a pleasant editor. A long doc set has to stay responsive: virtualized lists, search, and markdown that does not re-parse the whole library on every keystroke.

Warpforge and Sinew both render markdown in the agent chat. Neither is a docs/wiki editor. Warpforge’s CodeMirror is the lighter place to build that editor. Sinew’s Monaco is the heavier one. The rendered page, side by side with the editor or toggled with it, still has to be added.

Reviews of a named repo must score ACP fit against this note. Corpus map: [ACP-ECOSYSTEM-REPORT.md](ACP-ECOSYSTEM-REPORT.md).

## Starting point: fork Warpforge

**Fork Warpforge and build on that daemon.** The fork is `git@github.com:orchestrai-tools/orchestrai.git` (`https://github.com/orchestrai-tools/orchestrai`). `command_center` (`/Users/dev/projects/command_center`, AI Haus Deck) is a UI reference, not the engine.

Warpforge (`warpforgehq/warpforge`, MIT, review: [U055-warpforgehq-warpforge.md](U055-warpforgehq-warpforge.md)) already does the parts that are expensive to get right:

- A Rust daemon owns ACP sessions. The window is a client. Closing it does not kill the agents. The endpoint is `~/.warpforge/daemon.json`.
- Resume is `session/load`, with replay de-duplication and a recovery test. `command_center` speaks `initialize`, `session/new`, `session/prompt`, and `session/cancel`. It has no `session/load` or `session/fork`.
- Git worktrees are real and created off the daemon’s actor thread. `command_center` still throws “Git worktrees are not available yet.”
- Memory search is SQLite full-text plus local embeddings. Process groups, pinned ports, and a transcript store are already there.

`command_center` is ahead on the screens this product wants: the project grid, panes, markdown plans, approvals, and scoped memory. Port those screens onto the Warpforge daemon. Do not port Warpforge’s worktree and resume code into the Tauri process that dies with the window.

The public name is **orchestrai.tools** (Porkbun, parked “Coming Soon”). Warp’s open client remains the terminal and process source, copied into this fork. It is not the Warp terminal as the app itself.

## Remote: take Sinew's phone relay

The desktop must be drivable from a phone **off the local network**. The reference implementation is **Sinew**.

- Repo: [https://github.com/Paseru/sinew](https://github.com/Paseru/sinew) (MIT). Review: [U029-Paseru-sinew.md](U029-Paseru-sinew.md).
- The phone PWA and the desktop both open an outbound WebSocket to a relay. They do not need to be on the same LAN, and the phone does not SSH into the PC.
- Pairing is a 6-digit code (5-minute lifetime, 5 attempts, then a 60-second lock) plus ECDH. The session key is SHA-256 of `sinew-remote-pairing-v1`, the shared secret, both public keys, and the code. Chat after that is AES-256-GCM with AAD `sinew-remote-v1`.
- The relay only forwards ciphertext. Default host is `wss://remote.sinew-ide.com/ws`. The relay program is in the repo (`remote/server.mjs`); `npm run remote` serves it on localhost port 8787. The URL is overrideable, so a self-hosted relay can replace theirs.
- The desktop process must stay open. Files, tools, and the agent stay on that machine.

Sinew does **not** speak ACP. Steal the pairing and the opaque relay. Keep Warpforge's ACP daemon as the thing the phone is driving.

**Sinew beats T3 Connect for this remote.** T3 Code is MIT (review: [U025-pingdotgg-t3code.md](U025-pingdotgg-t3code.md)). Its server, same-network QR pairing, Tailscale, and SSH-to-another-computer path are self-hosted and need no T3 account. T3 Connect, the off-LAN phone path, is a Clerk login plus a Cloudflare tunnel. After linking, the phone talks to that tunnel hostname. The relay is not on the chat, and Cloudflare is: the tunnel ends TLS at their edge, and the session is normal authenticated HTTP. A stolen relay signing key is enough to abuse linking. The App Store and official desktop builds have T3's Clerk key and relay URL baked in. A fresh clone has Connect off. Running your own means your own Clerk app, your own relay deploy, and a rebuild of the clients.

T3's phone app is still the client to aim for later: a real iOS and Android app, the same RPC as the desktop, offline drafts, notifications. Build that against the Warpforge daemon and Sinew's relay. Do not take T3 Connect as the transport.

## Direct LLM: Sinew is a candidate, not the backbone

ACP workers (Codex, Claude, Gemini, OpenCode, and the rest) stay the default way to run an agent.

If a first-party loop that talks to a model HTTP API is also wanted, **Sinew's Rust** `run_turn` (`crates/sinew-app`) is the candidate to study or reuse. It is a real harness, not a thin chat wrapper:

- Stream, then tools, then continue. It repairs a missing tool result and rebuilds the tool list every round.
- Up to 5 stream retries with jittered backoff. A missing `MessageStop` counts as a dropped connection.
- Auto-compact before the stream and on context-length errors (at most 3 times per turn), with a cache-stable prefix.
- Read-fingerprint before edit or write. `write_file` can abort mid-stream when the path fails that check.

Do not treat it as a Codex replacement. Gaps that matter:

- Long Goal runs are a React effect. Closing the window stops them.
- Bash is unsandboxed. There is no approval prompt for shell or edits.
- Provider auth includes impersonating official Claude / Antigravity clients, which breaks when those vendors change the wire.



## Mission Control: take KLIDE's session list

Adopt KLIDE's **Mission Control** idea: one list of sessions from other LLM harnesses (Codex, Claude Code, and peers), not only sessions this app started. From that list you can **continue** a session or **fork** it inside the app.

KLIDE does this by hosting those CLIs as PTY "Delegates" and showing them as first-class runs on the same board as its own harness. It does not speak ACP. On the Warpforge base, the same board should sit on ACP sessions (`session/load` to continue, `session/fork` where the agent supports it).

## KLIDE's wrapper: interesting, not the base

KLIDE wraps a **native** terminal coding session. Codex, Claude Code, OpenCode, and Oh My Pi still run as themselves. You keep their TUI, login, and tool loop. KLIDE adds a shell around that: Mission Control, status, permissions, worktrees, and continue or fork from the app. The coding is still the original CLI. The extra experience is the wrapper.

That split is worth keeping in view. Pros: the real harness stays current, and the desktop does not have to reimplement its loop. Cons: the app only sees a terminal plus hooks, not ACP's structured session, so resume, fork, and tool events are weaker and easier to break. Warpforge stays the base because it wraps those same CLIs over ACP instead of a PTY. Revisit the wrapper if ACP cannot host a CLI you still want in its native form.

Local models in KLIDE (Ollama, MLX, text tool-call recovery, prefix-cache appends, cold-start failure budget) stay a component reference only, inside an ACP worker.

## Daintree: the UI for many harnesses at once

Daintree's UI is excellent, and it is the reference for **managing many harnesses at once**. Review: [U059-daintreehq-daintree.md](U059-daintreehq-daintree.md). Claude Code, Codex, Gemini, Copilot, Crush, OpenCode, Aider, Goose, Amp, and others sit in one panel grid. A plain terminal becomes an agent panel when you type the CLI's name. Fleet broadcast and the worktree dashboard are part of that same surface. Copy that ease of running several harnesses side by side.

The piece to copy first is the **command bar at the bottom of the left sidebar** (`QuickRun`). It is a command field, not a chat box: a `$` prompt labeled "Run command", scoped to the selected worktree. Saved commands, package scripts, and recent history are first-class suggestions. Enter starts that command in a terminal. Running tasks sit above the field. It does not send a prompt to an agent.

Also copy the **MCP that takes app actions**. One typed action list drives the command palette, keybindings, menus, plugins, and the inbound MCP server. A coding CLI in a panel calls that loopback MCP and runs the same actions a person can run in the UI: open a terminal, launch an agent, switch a worktree. Dangerous actions still ask for confirmation. The server binds to localhost and requires a bearer token.

The base stays Warpforge. Daintree learns status by watching terminal bytes. KLIDE's hooks remain the better status signal for a CLI that can post them, and KLIDE's `ptyd` is what keeps a terminal alive after the window closes. Take Daintree's multi-harness UI. Do not switch the shell to Electron to get it.

## Plugins: WASM tool calls, Zellij-style

Plugins must be able to add **new agent tool calls**, and the plugin code must be **WASM**, loaded the way Zellij loads plugins. Zellij's host is Rust. A plugin is a `.wasm` module the host instantiates in a sandbox. The host calls into it. The plugin cannot reach the filesystem or the network except through the host API. That is the runtime to copy.

What those plugins contribute here is different from Zellij. Zellij plugins draw panes, bind keys, and pipe messages. Ours register tools the agent can call. Daintree's plugin workers are the model to avoid for this: they are full Node processes running as the user, and the capability list does not sandbox them.

## Berd: unique UI, canvas home, SSH, voice

Berd (`block/berd`) has the most unique UI in the set. It is clean and inventive. Review: [U017-block-berd.md](U017-block-berd.md). The base stays Warpforge. Two ways to take the look, both still open:

- Port Berd's UI onto the Warpforge base.
- Or bring only Berd's **canvas home** into Warpforge.

The home is a free-placement canvas (`src/features/home`): widgets for agents, chats, projects, skills, prompts, notes, and similar, each with its own x/y/z. On a large monitor that board is the place to watch agents and their report updates, not a single chat column.

Also still open, from the same app:

- **SSH remote.** An experiment (`remote-ssh-sessions`) uses system `ssh`. A remote `goose serve` stays up on the host; the desktop keeps a local tunnel (`ssh -N -L`) and talks ACP through it. App exit drops the tunnel and leaves the remote daemon running. Key or agent auth only.
- **Phone conversation.** Berd's spoken session: on-device Apple speech, OpenAI speech-to-text and text-to-speech, and an experimental OpenAI Realtime "Expert/Spokesperson" split. You can talk while the agent is still streaming. This is a voice call with the agent. It is separate from Sinew's phone relay, which drives the desktop over the encrypted WebSocket.

kgoose automation tiles stay out. They are a client of a private Block service, and Berd's own design notes reject that screen as visual precedent.

## Browser: copy T3's Chrome profile

Copy T3 Code's browser use. The agent must be able to open web URLs already signed in as the user in Chrome. Review: [U025-pingdotgg-t3code.md](U025-pingdotgg-t3code.md).

T3 does this inside the desktop app, not by driving the Chrome window. Settings → Integrations → Browser profiles → Add profile → Import from Chrome. Chrome has to be quit. On macOS the app unlocks the keychain entry "Chrome Safe Storage," reads Chrome's cookie database, and writes those cookies into a private browser profile. Passwords are not copied. Partitioned cookies are skipped. The copy is once: later logins in Chrome stay in Chrome, and logins inside the preview stay in that profile. Some sites still ask for a fresh sign-in because the preview is T3's own Chromium.

Hand-opened tabs and the agent share that profile. The agent tools are `preview_open` and `preview_navigate` (plus snapshot and click). They use the profile marked Default unless a call names another one. The agent is told to stay on this preview.

Chrome import works on macOS and Linux. Windows Chrome cannot be imported: since Chrome 127 the cookies are encrypted to Chrome itself. This feature is Electron in T3. Bring the behavior over. Do not switch the Warpforge base to Electron to get it.

## Terminal: Sinew's drawer, Warp's process model

Adopt Sinew's **bottom terminal drawer** as the view: a panel along the bottom of the window, a short tab strip (about 28px), one tab per session, and a status on the tab (starting, running, exited). The markdown page stays on top. The terminal is something you pull up, not the main screen.

The process model is **Warp’s** (`warpdotdev/warp`, review: [R229-warpdotdev-warp.md](R229-warpdotdev-warp.md)). Sinew’s xterm PTY and Warpforge’s xterm workspace are not the implementation to keep.

## Warp client: copy the open Rust

Use as much of Warp’s open client as fits. AGPL v3 is accepted for that code. The product can be AGPL later. Review: [R229-warpdotdev-warp.md](R229-warpdotdev-warp.md). Repo: [https://github.com/warpdotdev/warp](https://github.com/warpdotdev/warp). The installed app is `/Applications/Warp.app`.

Take from the open tree:

- **PTY spawn and process tracking.** Unix `openpty`, close-on-exec, a controlling terminal, an event loop on the master, and `SIGCHLD` for child exit. Windows uses ConPTY. Do not reverse the bundled `conpty.dll`.
- **The shell is the agent’s shell.** A command is a block in that PTY. Exit status and the working directory come from shell hooks.
- **One write controller.** Commands, raw bytes, and agent input are queued. Writing into a running command is a separate permission from starting a new one. Handing the terminal back to the person is an explicit step.
- **Action lifetime.** Each action has an id and a typed cancel result. A superseded wait aborts the previous watchdog. Crash recovery keeps the parent process id.
- **Skill catalog** across Claude, Codex, Cursor, Gemini, and the other agent directories, with home, project, and bundled scope.
- **Instruction files.** `WARP.md` wins over `AGENTS.md` in the same directory. Ancestor rules apply. `~/.agents/AGENTS.md` is the global file.
- **Permission profiles.** Named bundles: always allow, always ask, or let the agent decide. A denylist is checked before an allowlist. `AlwaysAllow` is not the default.
- **Fan-out and wait.** A parent can start several children and wait until they report, with a spawn timeout and an idle watchdog.
- **SSH.** One ControlMaster connection, extra channels on that socket, and teardown only of sessions this app opened.
- **A local control socket** with a typed action list (window, tab, pane, session), in the spirit of `warpctrl`.

Leave what is not in the repo: the server, Warp Drive, and Oz. Those are the closed agent loop. ACP workers stay the model loop. Do not copy Warp’s GPU UI framework or its cloud sync.

## Onboarding: copy Helmor's first run

Copy Helmor's app onboarding (`dohooo/helmor`, `src/features/onboarding`). Review: [U013-dohooo-helmor.md](U013-dohooo-helmor.md). The base stays Warpforge.

The first launch locks the window to a fixed size (1300×810, not resizable, centered) and walks a short path: intro, sign in the coding agents, connect GitHub or GitLab, skills, then add a repo from disk or a clone URL. A mock of the real workspace (sidebar, conversation, inspector) stays on screen and moves with the step. Language can be switched in that window. Finish is stored as `app.onboarding_completed`. Agent login status is the real check, refreshed when the window focuses, not a slideshow of screenshots.

## Tasks, automations, workflows, and a GitHub page

Possible to adopt, and not locked to one app's design. The first reference is **Cezar** (`open-mercato/cezar`, review: [U062-open-mercato-cezar.md](U062-open-mercato-cezar.md)). If a later repo does any of these better, replace Cezar as the reference for that piece.

Wanted:

- **Git**, and a **GitHub page** that shows issues and pull requests.
- **Task:** one run of work, with a goal, its own place to code, and a visible status.
- **Workflow:** a reusable recipe of steps (agent work and checks). A task runs a workflow. The recipe is not itself a run.
- **Automation:** a trigger that starts a task. Cezar's triggers are a GitHub poll (new issue, label, review) or a schedule. The automation does not talk to the model; it creates a task.

Cezar's split is the one to beat, not the implementation to copy. It keeps those three as separate files, drives Claude, Codex, OpenCode, or Pi, and isolates each task in a git worktree. The new app can use a different store, a different trigger, and ACP workers instead of those CLI wires.

## Shep: how a finished task meets CI and a pull request

Shep (`shep-ai/shep`, review: [U063-shep-ai-shep.md](U063-shep-ai-shep.md)) is the reference for the ending of a task. Cezar stays the reference for what a task, a workflow, and an automation are.

A person can stop the run at the requirements, the plan, or the merge. After that, Shep pushes, watches the CI runs, lets the agent fix failures a few times, and opens a draft PR.

A second, smaller rule: write project memory only after a merge succeeds, then inject a short ranked slice on the next run. The store stays the Warpforge index.

## Buzz: an AI Slack

Buzz is cool, and it stays on the list. It is an AI Slack: a workspace with agents in the room. Review: [U051-block-buzz.md](U051-block-buzz.md). The base stays Warpforge. Adopt these three, not the Nostr relay or the Builderlab account.

- **Agents page** (`AgentsView`). One screen to set up and manage agents: who they are, whether they are running, and the defaults they inherit.
- **Agent teams** (`TeamsSection`). A team is a named group of agents. The action that matters is adding the whole team to a channel at once.
- **Channel.** The shared room is the loop. Humans and agents are both members. They read the same thread, and an agent joins by being in the channel, not by a private side chat. A mention in the channel is how you steer one.



## Buzz: the landing page

Buzz's desktop has a strong first screen (`desktop/src/features/onboarding/ui/MachineOnboardingFlow.tsx`, the `identity` page). A large wordmark, the line "Your people, your agents, your projects — all in one place," and a field of bees (`LandingBees`) that drift on their own and move away from the pointer. It is a landing page, not a setup form.

Keep it as a reference for how the app opens. Helmor's onboarding is still the step-by-step first run. This does not change the Warpforge base.

## AgentDock and Agent Swarm

Nothing to adopt from either.

**AgentDock** (`vishalnarkhede/agentdock`, review: [U054-vishalnarkhede-agentdock.md](U054-vishalnarkhede-agentdock.md)) is a local dashboard that starts Claude or Cursor inside tmux and streams the terminal. It does not speak ACP. The panel grid and the session list already have references (Daintree, KLIDE).

**Agent Swarm** (`desplega-ai/agent-swarm`, review: [U045-desplega-ai-agent-swarm.md](U045-desplega-ai-agent-swarm.md)) is a control plane that polls and spawns other harnesses, including Codex over ACP. Its memory index and its workflow graph were reviewed and left. Cezar stays the reference for a task, a workflow, and an automation.

## Goose: take the loop habits, not the desktop

Goose (`aaif-goose/goose`, Apache-2.0, review: [R057-aaif-goose-goose.md](R057-aaif-goose-goose.md)) is a worker, not the base. `Goose.app` is an Electron window that starts `goose serve` and talks ACP to that one process. The shell stays Warpforge. Spawn Goose with `goose acp` or `goose serve`, beside Codex and Claude.

Take these from the Rust agent:

- **Compaction that the person can still read.** The full history stays on screen. The model only sees the summary. If the context is too long, compact once, with a cap, and continue.
- **Subagents that cannot nest.** `delegate` starts an isolated run. `load` adopts another agent's instructions into this run. The parent can peek or cancel. There is a cap on how many run at once. A child cannot start its own child.
- **Recipes.** A YAML runbook with parameters, nested recipes, a JSON response schema, retries, a shell success check, and an `on_failure` step. Cezar still defines a task, a workflow, and an automation. A recipe is the shape to beat for the reusable steps inside a workflow.
- **Two ways to stop.** `/goal` checks the result and stops. `/grind` keeps going until a turn cap. These are endings of a run, not a second planner.
- **Shell output.** The model sees the last lines. The full output stays in a temp file. The result is stdout, stderr, the exit code, and whether it timed out.
- **Edits that must match once.** If the old text is missing or appears twice, show a preview and a near match. Do not write the file.
- **Permission modes.** Auto, approve, smart approve, and chat. A tool can say it is read-only. An optional check can ask a model whether a call is read-only before it runs.

Leave Goose's file-based memory. The store stays the Warpforge index, and a memory is written only after a merge succeeds. Leave the Electron app, its telemetry, and the long reply function in `agent.rs`.

## Version control: look into Jujutsu

Look into adding **Jujutsu** (`jj`) support beside Git. This is an investigation, not a switch off Git. Warpforge's worktrees, checkpoints, and task isolation are Git today.

T3 Code is not a source for the implementation. Its settings page probes `jj --version` and shows **Coming Soon**. `VcsDriverKind` includes `"jj"`, and the only driver that exists is `GitVcsDriver`. No status, commit, worktree, or checkpoint path calls `jj`.

## Zed: the ACP client reference

Zed (`zed-industries/zed`, GPL-3.0 with Apache-2.0 GPUI) created ACP and is the reference for how an ACP **client** should behave. It drives Claude Code, Codex, Gemini CLI, and other agents from its Agent Panel. It has no API for driving the app from outside. The client behaviors below come from Zed's docs. The process lifetime was checked in source; see the spike.

Take these three:

- **How ACP work is shown.** The person follows the agent around the codebase as it works, and the agent's edits land as one live multi-file diff with syntax highlighting. This is the reference for how the session board and task view show ACP tool calls and changes.
- **The ACP Registry.** Agents are installed from the registry instead of a hand-kept list. Onboarding and agent setup should use it.
- **Editor and preview stay in sync.** The markdown preview follows the editor's selection and active block, and renders Mermaid, images, and task checkboxes that can be toggled. This is the interaction the docs library should copy, built in CodeMirror.

The base stays the Warpforge fork. See the spike below.

## Spike: Zed as the base

**Verdict, 30 September 2026. Keep the Warpforge fork.** Zed stays the ACP client reference.

Checked against `zed-industries/zed` `origin/main` at `40180d9c40` (30 September 2026). The local checkout at `/Users/dev/projects/zed` was from October 2025, so the read was `git show origin/main`.

**Can the headless server own ACP sessions after the window closes?** No.

- `remote_server` is a headless process that outlives a dropped SSH connection. It owns files, language servers, terminals, git, and the list of installed agents (`HeadlessProject` builds an `AgentServerStore` and shares it over the remote session).
- The ACP connection does not live there. `AcpConnection::stdio` in `crates/agent_servers/src/acp.rs` runs in the window process. `spawn_stdio` (`crates/agent_servers/src/acp/transport.rs`) starts the agent as a child of that process. For an SSH project it wraps the command with `RemoteClient::build_command`, so the child is a local `ssh` whose remote end is the agent. `Drop` for `AcpConnection` kills that child.
- Closing the window ends the agent. The headless server staying up does not keep the session. Running it against localhost over SSH would not change that: the client would still be the window.

**How reliable is resume?** The protocol call exists and is gated. `AcpConnection::load_session` sends a load-session request only when the agent advertises `load_session`; `resume_session` is a separate capability. History support for external agents shipped (issue 37074, closed February 2026). Threads still load empty after a restart: issue 54750 is open, last touched 24 September 2026, with the same report for Kimi, Cline, Cursor, and Claude Code. Warpforge's `session/load` path has a recovery test. Zed's does not hold up as the thing to build on.

**What would stripping cost?** Collaboration, sign-in, and Zed's own model service are ordinary dependencies of the `zed` crate (`collab_ui` is a direct dependency), not a feature flag. Removing them is a large deletion across the editor. The agent panel, terminal threads, worktrees, and the ACP client would remain. Zed is GPL-3.0, so Warpforge's MIT workflow, automation, and memory code can sit beside it as a separate process. Folding that code into the editor would put it under the GPL.

**What this leaves.** Copy the three client behaviors already listed. Do not move the product onto a Zed fork unless a later Zed release hosts the ACP connection inside `remote_server` and issue 54750 is fixed.

## What not to mix up


| Piece                                                | Use                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warpforge                                            | The fork. Daemon, ACP resume, worktrees, and the search index.                                                                                                                                                                        |
| command_center                                       | UI reference. Port the grid, panes, plans, approvals, and scoped memory onto the Warpforge daemon.                                                                                                                                    |
| Sinew remote                                         | Phone pairing and encrypted relay. Beats T3 Connect for off-LAN.                                                                                                                                                                      |
| T3 phone app                                         | Client to aim for later (native iOS/Android, offline drafts). Transport stays Sinew.                                                                                                                                                  |
| T3 browser profiles                                  | Copy. In-app browser that opens URLs with a one-time import of Chrome's cookies. Not live Chrome.                                                                                                                                     |
| Jujutsu (`jj`)                                       | Look into adding it beside Git. T3 only reserves the name.                                                                                                                                                                            |
| Helmor onboarding                                    | Copy. Fixed first-run window, live mock of the workspace, steps for agents, forge, skills, and a repo.                                                                                                                                |
| Sinew terminal drawer                                | Bottom-panel UI only.                                                                                                                                                                                                                 |
| Warp client                                          | Copy the open Rust: PTY, process tracking, write controller, blocks, skills, instruction files, permission profiles, fan-out, SSH ControlMaster, local control. AGPL is accepted. Oz, Warp Drive, and the server are not in the repo. |
| Zed                                                  | ACP client reference. Copy how it shows agent work, the ACP Registry, and the synced markdown preview. Spike (30 Sep 2026): its headless server does not own ACP sessions, so it is not the base. |
| Goose                                                | Worker, not the base. Take compaction the person can still read, non-nesting subagents, YAML recipes, goal vs grind, shell truncation, unique-match edit, and permission modes.                                                       |
| KLIDE Mission Control                                | One list of Codex, Claude, and peer sessions. Continue or fork in-app.                                                                                                                                                                |
| KLIDE native wrapper                                 | Interesting. Native CLI still codes; the app wraps it. Not the base. ACP wrap is preferred. Pros and cons stay open.                                                                                                                  |
| Daintree UI                                          | Copy. Many harnesses in one panel grid, the bottom-left command bar, and MCP tools that are the app's own actions.                                                                                                                    |
| Plugins                                              | WASM, Zellij-style host. Plugins register new agent tool calls. Not Daintree's Node workers.                                                                                                                                          |
| Sinew `run_turn`                                     | Optional direct-to-LLM loop                                                                                                                                                                                                           |
| Berd UI                                              | Most unique, clean UI. Open: port the UI onto Warpforge, or only the canvas home.                                                                                                                                                     |
| Berd canvas home                                     | Large-monitor board to watch agents and their report updates.                                                                                                                                                                         |
| Berd SSH remote                                      | Open. Remote Goose over system `ssh`, ACP through a local tunnel.                                                                                                                                                                     |
| Berd phone conversation                              | Open. Spoken session (on-device speech, OpenAI voice, experimental Realtime). Separate from Sinew's phone relay.                                                                                                                      |
| ACP agents (Codex, Claude, Gemini, OpenCode, …)      | The workers the daemon spawns                                                                                                                                                                                                         |
| Tasks, workflows, automations, GitHub issues and PRs | Possible adopt. Cezar is the first reference. Swap the reference if something better shows up.                                                                                                                                        |
| Shep task ending                                     | Adopt. Stop at requirements, plan, or merge. Then push, watch CI, fix failures a few times, and open a draft PR.                                                                                                                      |
| Shep project memory                                  | Write only after a merge succeeds. Inject a short ranked slice next time. Store stays the Warpforge index.                                                                                                                            |
| Buzz landing page                                    | Reference for the first screen: wordmark, one line, a field of bees that drift and shy away from the pointer. Not Helmor's step wizard.                                                                                               |
| Buzz as an AI Slack                                  | Adopt. Agents page, agent teams, and the channel as the shared loop. Humans and agents are members of the same room.                                                                                                                  |
| AgentDock                                            | Nothing to adopt. Tmux dashboard for Claude and Cursor.                                                                                                                                                                               |
| Agent Swarm                                          | Nothing to adopt. Control plane, memory index, and workflow graph were reviewed and left. Cezar stays the task/workflow/automation reference.                                                                                         |


