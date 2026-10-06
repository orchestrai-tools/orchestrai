<h1 align="center">OrchestrAI</h1>

<h2 align="center">Run parallel coding agents without losing the workspace.</h2>

<p align="center">
  An open-source, local-first agentic development environment for Claude Code, Codex, OpenCode, and other coding agents — one workspace for agent workflows, projects, dev services, ports, files, diffs, and human review.
</p>

<p align="center">
  <a href="https://github.com/orchestrai-tools/orchestrai/actions/workflows/ci.yml"><img src="https://github.com/orchestrai-tools/orchestrai/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8bcf6a" alt="MIT license"></a>
</p>

> [!NOTE]
> OrchestrAI is a fork of [Warpforge](https://github.com/warpforgehq/warpforge). It keeps its own identity so both can run on one machine: the app is **OrchestrAI** (`tools.orchestrai.desktop`), the binary is `orchestrai`, machine data lives in `~/.orchestrai`, and each project's config lives in `.orchestrai/workspace.yaml`. It never reads Warpforge's `~/.warpforge` or `.warpforge/` folders. The feature descriptions and docs links below come from Warpforge and apply here too.

<p align="center">
  <a href="#install">Install</a> ·
  <a href="https://warpforge.app/overview/">Docs</a> ·
  <a href="https://warpforge.app/concepts/why-warpforge/">Why Warpforge?</a> ·
  <a href="https://warpforge.app/concepts/agents/">Agents</a> ·
  <a href="https://warpforge.app/concepts/memory/">Memory</a> ·
  <a href="https://warpforge.app/guides/choosing-your-mode/">Modes</a> ·
  <a href="https://warpforge.app/guides/automations/">Automations</a> ·
  <a href="https://warpforge.app/reference/mcp-tools/">Agent tools</a> ·
  <a href="https://warpforge.app/guides/projects-and-runtime/">Projects &amp; runtime</a>
</p>

<p align="center">
  <img src="docs/images/task-detail.png" alt="Warpforge task view: agent conversation, live diff, and staged changes" width="100%">
</p>

Warpforge is an **agentic development environment (ADE)**: the operating layer around your coding agents. Agent conversations, project runtime, isolated worktrees, live services, configurable multi-agent workflows, and human review live in one place — so running several agents does not turn into managing several terminals.

It does not replace Claude Code, Codex, or OpenCode; those tools still do the coding. Warpforge gives them shared project context, parallel execution, runtime visibility, and a reviewable path from prompt to commit. Everything runs on your machine: there is no separate Warpforge account or API key, and your existing agent authentication stays with the underlying CLI.

## Install

OrchestrAI has no published release yet, so [build it from source](#build-from-source). Automatic updates are off until it publishes its own signed releases; the Warpforge release feed would install Warpforge over it.

It runs beside an installed Warpforge without sharing anything: separate app, daemon, data folder, endpoint file, and agent tool server. Projects you already use in Warpforge need adding again in OrchestrAI, and each repository's `.warpforge/` folder needs a copy at `.orchestrai/`.

Two features shell out to CLIs the app doesn't bundle: **Node.js/`npm`** for one-click agent install/update, and the **[GitHub CLI](https://cli.github.com/)** (`gh`, authenticated via `gh auth login`) for **Open pull request** — commit and push don't need it.

### Reuse your existing agent login

Warpforge adds no model account or API-key layer. It looks for supported agent binaries on your `PATH`, speaks the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) to them over stdio, and stores your enabled-agent selection locally. If Claude Code, Codex, or OpenCode is already installed and authenticated, that setup is reused as-is — the CLI keeps owning authentication, model access, and the coding itself.

## Why Warpforge?

AI-assisted development becomes a coordination problem long before it becomes a model problem: agents wait on each other, services collide on the same ports, logs hide in terminal tabs, and finished work scatters across chats, worktrees, and diffs. Warpforge turns that sprawl into one visible workflow — Mission Control for every session, a runtime that travels with the task, human review at the moments that matter, and an orchestrator for when a task outgrows one agent.

Read the full pitch in **[Why Warpforge?](https://warpforge.app/concepts/why-warpforge/)**

<p align="center">
  <img src="docs/images/new-task.png" alt="New task composer in orchestrator mode, choosing the lead agent and previewing the delegated split" width="100%">
</p>

## Bring your own agents

Warpforge detects Claude Code, Codex, OpenCode, Qwen Code, Goose, Junie, Cursor, Pi, and Grok Build as globally installed binaries and speaks [ACP](https://agentclientprotocol.com/) to them over stdio — no separate Warpforge account, no new API key, your existing agent login just works. Any other ACP-compatible agent can be added with a custom command.

See **[Bring your own agents](https://warpforge.app/concepts/agents/)** for the full list and setup details.

## Orchestration and workflows

A regular task is one conversation with one agent. Enable **Orchestrator** and that agent becomes a lead that can dispatch bounded sub-tasks to other harnesses and track their results in context. For repeatable work, configured **workflow pipelines** drive a fixed `plan? → implement → review ⇄ fix` sequence across stages, each with its own agent and model, pausing for human input at review limits and never committing automatically.

<p align="center">
  <img src="docs/images/workflow-pipeline.png" alt="Workflow pipeline with implement, review, and fix stages and a reviewer verdict" width="100%">
</p>

Details in **[Orchestration and workflows](https://warpforge.app/concepts/orchestration/)** — and **[Choosing your mode](https://warpforge.app/guides/choosing-your-mode/)** for when each is worth its cost.

## One memory, every harness

Claude Code reads `CLAUDE.md`, Codex reads `AGENTS.md`, opencode reads its own — teach one, and the other two still don't know. Warpforge gives them a single local store instead, with global and per-project scopes, full-text plus optional local-embedding search, and a **dreaming** pass that reviews stored facts against the codebase and *proposes* merges and corrections for you to approve — it never rewrites memory on its own.

Agents reach it through the same tool surface they use for everything else: **[38 MCP tools](https://warpforge.app/reference/mcp-tools/)** covering the runtime (read a service's logs, restart it), the board (file a task), memory, scheduled automations, and — for orchestrators — sub-agents and pipelines.

More in **[Cross-harness memory](https://warpforge.app/concepts/memory/)**.

## Projects and their runtime

Register a project once and OrchestrAI reads or creates `.orchestrai/workspace.yaml`, brings its services online in dependency order with captured logs and readiness detection, and gives every project a predictable 100-port range starting at `4000` — no more `address already in use`. A local Rust daemon owns all state behind a WebSocket API, so task history and conversations are kept between sessions; quitting stops running services and agents. Review changed files as unified or split diffs, revert individual hunks, commit, push, and open a pull request from the same workspace.

Full guide: **[Projects and their runtime](https://warpforge.app/guides/projects-and-runtime/)** · config schema: **[Configuration reference](https://warpforge.app/reference/configuration/)**

## Build from source

The only way to run OrchestrAI for now.

```bash
git clone https://github.com/orchestrai-tools/orchestrai.git
cd orchestrai/desktop
bun install
bun run tauri dev
```

Prerequisites, running the checks, and building a local bundle: **[Build from source](https://warpforge.app/getting-started/build-from-source/)**.

## CLI

The Rust binary manages the project registry directly and can run the daemon by hand:

```bash
orchestrai add <path>       # register a project
orchestrai remove <name>    # unregister it
orchestrai list             # list projects and port ranges
orchestrai init [path]      # create workspace config (--add also registers it)
orchestrai bootstrap [path] # generate a config interactively with an agent
```

`install.sh` installs this as `orchestrai` from published archives once releases exist (macOS Apple Silicon only); it does not install the desktop app. Full command reference: **[CLI reference](https://warpforge.app/reference/cli/)**.

## Current scope

Warpforge is young software, shipped and built in the open: macOS Apple Silicon and Linux x64 are validated, Windows remains an unvalidated preview, and runtime state is local to one machine. See **[Architecture and current scope](https://warpforge.app/reference/architecture/)** for the full picture.

Bug reports, design feedback, and focused pull requests are welcome. If you use Warpforge on a real multi-agent workflow, sharing what felt smooth — and what still sent you back to terminal juggling — is especially useful. Release notes live in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
