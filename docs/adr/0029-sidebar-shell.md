# 0029 — Sidebar shell command

**Status:** accepted (2026-10-01)

## Context

The sidebar needs a `$` field for shell commands in the selected project. It is not the agent composer. Saved commands, package scripts, and recent commands belong next to it.

## Decision

`shell.run` runs the text with `sh -c` in the project directory, or in the open task’s worktree when that directory exists. Output is capped and the process is stopped after 30 seconds. The field keeps a local history and offers `package.json` scripts as `bun run` commands.

## Rejected

Sending the field to the agent, and a command runner with no timeout.

## Addendum (2026-10-04): detected commands and where they run

**Detection moved to the daemon.** `shell.commands` lists what the project
declares where `shell.run` would run, so it can read files directly, run
`just`, and resolve the task worktree the same way. `src/daemon/runners/` has
one file per source: `package.json` scripts (run with the lockfile's package
manager), justfile recipes, and Makefile targets (`##` comments are
descriptions). Results are cached per folder until a watched file's
modification time changes, for at most 60 seconds.

**Justfiles are read by `just`.** `just --dump --dump-format json` gives the
exact recipes, parameters, docs, groups, confirms, aliases, the default recipe,
and modules (run as `just mod::recipe`). Without `just`, a text parser ported
from Daintree's `RunCommandDetector` stands in; its recipes carry
`exact: false`, and the reply carries a hint to install `just`.

**Where a command runs.** Long-running commands open in a terminal tab
(`terminal.spawn`, same worktree), and everything else goes through
`shell.run`. "Long-running" comes from the name or body (dev, serve, watch,
`vite`, `http.server`…). Shift flips the choice for a run, and a `shell.run`
that times out offers the terminal instead.

### Invariants

- A recipe that needs a confirm is confirmed in the app's dialog, and then run
  as `just --yes`. `shell.run` has no stdin, so without `--yes`, `just`
  refuses with "recipe was not confirmed".
- Parameter values are shell-quoted when the line is built
  (`shell/command-bar/model.ts`). Empty trailing optional parameters are left
  out so `just` applies its own defaults. An empty optional parameter before a
  filled one needs a literal default, because arguments are positional.
- The Factory runner (`daemon::runner`) is unrelated to `daemon::runners`.

### Rejected

- Keeping detection in the browser. It cannot run `just`, and it re-read
  `package.json` on every focus.
- Regex parsing as the primary justfile reader. It misses modules, imports,
  and attribute forms that `just` resolves itself.
- Taskfile, Procfile, mise, Django, Composer, and devcontainer sources for now.
  Each one is a single new file in `runners/` when it is wanted.
