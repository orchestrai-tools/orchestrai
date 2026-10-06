# Notes

most llm apps including desktop, web, cli, llm runs in a loop. Lets extract from all references the best loop designs, patterns, nuances, addons, hooks, optimizations, cache, tools, variations, types, maturity scale from 1 to 10. All of these points with full code examples and clear explanation to create an educational book. from cheap to expensive teams implementation. llm loop disected

(Steering, vs queue)

I'm interested now how these apps do terminal on screen, keep processes running, manage them, spawn, once again from maturity 1 to 10 in robusteness, patterns, different ways teams are handling the same problem.  

the same thing for git, PRs

The same thing for worktrees. I want to see clever and different ways users do worktrees, from single to complex, to small to nasa scale.

The same thing for memory  

the same thing for workflows, tasks, automation  

The same thing for remote control

todo: learn about Cloudflare Tunnel and how it is used for remote control (Helmor's phone companion, T3 Connect)

Handling Markdown, lets find the best desktop handling of markdown files, large files, rendering, editing ux

browser use access.

harness and apps with computer use, how does it happens and different types.

how harnesses integrate with LSP and what benefits does it bring, some level  and style of research as others.

Create a daily or weekly watcher for   

- Coding cli  
- harnesses
- desktop harnesses  
- bots platfroms
- agent orchestrators
- software factories
- memory systems
- context management
- toolcalts

system 1 agents

TODO: inspect System One Harness. Clone is `awesome-cli-coding-agents/UI-References/HarnessRouter-SystemOneHarness` (https://github.com/HarnessRouter/SystemOneHarness, Apache-2.0). The loop is `systemone_harness/controller.py`, with `actions.py`, `encoder.py`, `gate.py`, `provider.py`, and `envs/` for a process, an MCP server, and a web page.

does any of these tools have a2a

vm, sandbox management for agents.

## Ideas to pursue

Both are separate projects, not changes to orchestrai. Orchestrai stays on the Warpforge fork.

### WarpTree: Daintree on top of Warp

Working name: **WarpTree**.

Fork Warp's open client (`warpdotdev/warp`, AGPL) and build Daintree's multi-harness UI on it: the panel grid of live coding CLIs, prompt broadcast to many panels, the worktree dashboard, the `QuickRun` command bar, and one typed action list that is also the MCP tools (Warp's `warpctrl` is halfway there).

Why it is interesting:

- Warp already detects Claude Code, Codex, Gemini, OpenCode, Amp, Droid, and Copilot running in a block (`CLIAgent`), launches them, and keeps their transcripts for resume.
- Status comes from command blocks and shell hooks, not from guessing at terminal bytes the way Daintree does.
- Rust PTY and process tracking instead of `node-pty` in Electron. Native, GPU-rendered.

What it costs: every Daintree screen rebuilt in Warp's own UI toolkit, Oz removed or left unused, and a large, fast-moving upstream to merge.

Link to orchestrai: what this project learns about Warp's PTY and process code feeds ORC-07.

### Fork Hypha, rewrite it in Rust, and integrate System One Harness

Fork Hypha ([CodeSoul-co/Hypha](https://github.com/CodeSoul-co/Hypha), Apache-2.0), rewrite that runtime in Rust, and integrate System One Harness ([HarnessRouter/SystemOneHarness](https://github.com/HarnessRouter/SystemOneHarness), Apache-2.0). Both licenses allow the combination. Hypha's clone is `harness-notes/temp/hypha`. System One's clone is `awesome-cli-coding-agents/UI-References/HarnessRouter-SystemOneHarness`. System One stays the Python reference for the decision loop. The Rust port is Hypha's event log, state machine, leases, checkpoints, and recovery, with the System One gate called at `PolicyChecked`.

Hypha already stops a run in `PolicyChecked` before anything runs, and it already has `HumanReview`, an event log, a checkpoint written before the tool, and a lease so a dead worker can be replaced. System One fills that stop. The state machine builds the menu of actions that are possible right now. The decision model only picks, and every answer comes back with a probability. `gate.py` compares the weakest judgment to a bar set by risk. Below the bar nothing runs, and the full distribution is stored as an event, which is the handoff to a person or to Hypha's text model.

Hypha's ReAct core still does the work that needs prose. System One cannot write free text, so it does not replace that loop. It decides whether the next action is allowed to run.

The inspect TODO under "system 1 agents" is the first step: read `controller.py`, `actions.py`, `encoder.py`, and `gate.py` before cutting the fork.