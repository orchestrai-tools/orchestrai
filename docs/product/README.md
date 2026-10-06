# Product notes

Decisions gathered while comparing desktop harnesses, before changing this fork. The Warpforge ADRs in `docs/adr/` stay as upstream design records. These files are ours.

| File | What it is |
|---|---|
| [DECISIONS.md](DECISIONS.md) | What to adopt, what to leave, and why the base is this Warpforge fork. |
| [INVENTORY.md](INVENTORY.md) | Every capability the fork has today (desktop, daemon, MCP tools, CLI, TUI, config), what is only planned, and where each lives in the project-first shell mock. |
| [BACKLOG.md](BACKLOG.md) | Next-step tickets from those decisions, in milestones, plus spikes for the open questions. |
| [HARNESS-FIT.mdc](HARNESS-FIT.mdc) | The checklist used on every later review. The same text is in `.cursor/rules/acp-harness-fit.mdc`. |
| [NOTES.md](NOTES.md) | Open research still to do: agent loops, terminals, git, worktrees, memory, workflows, remote, markdown, browser, computer use, LSP. |

Per-repo reviews that produced these decisions stay in `awesome-cli-coding-agents/research-output/`. This folder is the synthesis.

Design principles (interface philosophy, corners) live in [`../design/`](../design/README.md).
