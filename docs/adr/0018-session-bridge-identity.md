# 0018 — A session's warpforge bridge takes its identity from the agent's environment

**Status:** accepted (2026-09-27)

## Context

Every agent session gets the warpforge MCP bridge over ACP, named `warpforge`,
with `WF_TASK`/`WF_PROJECT`/`WF_MODE` in the server entry. Claude Code keeps
one MCP server per name, so a `warpforge` entry in the user's own Claude config
(`claude mcp add`, any scope) competes with the session's. Orchestrator chat
`t_5401d73a` ran next to a leftover local-scope entry (`WF_MODE=single`,
`WF_TASK=policy-probe`). In every agent process that started that entry instead
of the session's, the twelve orchestrator-only tools were missing, and Claude
Code reported them "disconnected" against the transcript. The shared tool names
stayed, which made it look like a partial disconnect.

It was never a bridge dying mid-session: Claude Code's MCP logs
(`~/Library/Caches/claude-cli-nodejs/<cwd>/mcp-logs-warpforge/`) record the
bridge's first stderr line, and each loss is a new agent process (a session
resumed after a daemon restart) that started only the user's entry. All of
those came from the `tauri dev` daemon. Claude Code drops every stdio server
passed over ACP when it inherits `CLAUDE_CODE_BRIDGE_MCP_CARRIER=1` (it then
believes it is a Remote Control carrier child); that reproduces the loss
exactly, but is not confirmed as what the dev daemon's agents inherited.

## Decisions

**The daemon puts the session identity on the agent process**
(`actor/prompt.rs` `bridge_env`, called from `start_session`):
`WARPFORGE_SESSION_TASK`, `_PROJECT` and `_MODE`. Claude Code passes its
environment to the MCP servers it starts, so every bridge it runs sees them,
and the bridge prefers them to the `WF_*` of whichever entry launched it
(`mcp/identity.rs`). The tool set no longer depends on which entry the agent
keeps. The `WF_*` in the ACP entry stay for agents that do not pass their
environment through.

**The daemon strips `CLAUDE_CODE_BRIDGE_MCP_CARRIER`** from agents it starts.
No warpforge agent is a Remote Control child; a daemon started from inside
such a session must not hand the flag down.

**A daemon forgets an identity it inherited.** A `warpforge daemon` (or a
`tauri dev`) started from an agent's shell inherits that session's
`WARPFORGE_SESSION_*`. At startup it removes them, and the carrier flag, from
its own environment (`mcp/identity.rs` `forget_inherited_session`, called
first in `main.rs`), so its terminals, services, text-generation agents,
prechecks and installs do not inherit them.

**Everything the agent itself starts is the same session, on purpose.** The
identity is on the agent process so that the bridges it starts inherit it,
and that includes a `claude -p` or `opencode run` launched from the agent's
shell. That nested CLI's bridge acts as the session: as an orchestrator, its
`read_inbox` drains the session's results. This is a known limit, not a guard.

**The bridge never ends because of the daemon** (`mcp/serve.rs`,
`mcp/daemon_client/`). `daemon.json` is re-read before every request and a new
endpoint (url, token or pid) is dialed before anything is sent, unless the
daemon the bridge is connected to still runs: a second daemon publishing
itself does not take the session from the first. A daemon removes
`daemon.json` on exit only while it still names that daemon's pid. A transport
error drops the connection for the next call; connecting and answering have
deadlines; a panicking tool, a line that is not JSON and an unknown request all
get answers. Its stderr writes cannot panic.

### Rejected

- **Renaming the session's server.** `mcp__warpforge__*` names are in users'
  permission allow-lists and agents' memory, and opencode labels key on the
  `warpforge_` prefix.
- **`strictMcpConfig` for session agents.** It drops every other MCP server
  the user configured.
- **Finding and warning about the user's entry.** It lives in another app's
  config, per scope and per account, and each harness keeps its own.
- **Logging the bridge to a file, as the daemon does (0014).** The agent keeps
  the bridge's stderr in its MCP server log, which is where this was diagnosed.
- **Requiring the agent's pid in the bridge's parent chain.** A nested CLI's
  bridge descends from the agent too, so the chain cannot tell it apart. A
  direct-parent check would break harnesses that start servers through a
  wrapper (`npx`, a shell, an ACP adapter's own child).
- **A single-instance lock on `warpforge daemon`.** The dev flow runs a
  `tauri dev` daemon next to the installed app's, on the same `~/.warpforge`.

## Invariants

1. **Session variables outrank `WF_*` as a unit.** (`mcp/identity.rs`) The
   session's task with an entry's `WF_MODE=single` would serve the orchestrator
   single-mode tools: the same loss.
2. **Every task session the daemon starts goes through `bridge_env`.**
   (`actor/session.rs`) A new way to start a session must call it too.
3. **Only stdin EOF or a failed read or write ends `serve`.** The agent cannot
   restart the server; a tool call that fails must still be answered.
4. **`DaemonClient` puts a connection back only after a complete exchange.**
   (`mcp/daemon_client/mod.rs`) Anything else leaves a dead or half-read
   socket for the next call.
5. **The daemon drops inherited session variables before it spawns
   anything.** (`main.rs`) Anything started earlier passes on the identity of
   the session the daemon was launched from.
