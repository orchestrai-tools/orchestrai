# 0030 — OrchestrAI has its own identity, separate from stock Warpforge

**Status:** accepted (2026-10-04)

## Context

This repository is a fork of Warpforge, and people run both on one machine.
Every name the two shared made them fight:

- One `~/.warpforge` held both apps' database, `projects.json`, memory, and logs,
  so two daemons wrote one SQLite file.
- One `~/.warpforge/daemon.json` meant each desktop app could reach the other's
  daemon. Then the version handshake failed, or quitting one app stopped the
  other's daemon (ADR 0014).
- Both apps used the bundle id `dev.warpforge.desktop`, so macOS treated them as
  one app: the same webview storage, notifications, and window state.
- One binary name, `warpforge`, existed for both the CLI and the agent bridge.
  One MCP server name, `warpforge`, hit the same Claude Code collision that
  ADR 0018 records.
- The updater feed was stock Warpforge's release feed, signed with its key.
  Installing an update would replace the fork with stock Warpforge.

## Decisions

**One place for every name.** `crates/warpforge-protocol/src/identity.rs`
holds the app name (OrchestrAI), the binary (`orchestrai`), the MCP server
(`orchestrai`), and the folder name (`.orchestrai`). It also defines the data
folder: `ORCHESTRAI_HOME`, or else `~/.orchestrai`. The daemon reaches it
through `registry::data_dir()`, and the Tauri shell calls `data_dir_from`
directly. The Tauri bundle is `tools.orchestrai.desktop` and the desktop
binary is `orchestrai-desktop`. Environment variables use the `ORCHESTRAI_`
prefix.

**A clean break, not a migration.** Nothing is copied from `~/.warpforge`, and
stock Warpforge's config is not read. That covers `.warpforge/workspace.yaml`
and the root-level `.warpforge.yaml`, `.wf.yaml`, and `.workspace.yaml`. A
project is configured by `.orchestrai/workspace.yaml` alone.

**Auto-update is off.** The updater plugin, its config, and its permission are
removed, and the UI reports `off`. Release and Homebrew jobs are disabled until
the fork has its own signing key and feed. Re-enabling them means setting
`ORCHESTRAI_RELEASES_ENABLED` and pointing the feed at this repository's
releases.

Internal crate and package names (`warpforge`, `warpforge-protocol`,
`@warpforge/*`) stay as they are. Nobody outside the repository sees them.

## Rejected

- Copying `~/.warpforge` into `~/.orchestrai` on first launch. Rejected in
  favour of a fresh start.
- Reading `.warpforge/` as a fallback. One repository opened by both apps would
  then share a config the two apps can drift apart on.
- Keeping the per-repo folder shared while renaming only machine-level names.
- Pointing the updater at this repository with a new key now. There are no
  releases yet.

## Invariants

- No code path builds `~/.warpforge`, `<repo>/.warpforge`, or the name
  `warpforge` for a binary, MCP server, bundle id, or env var. Go through
  `identity` (`DIR`, `BIN_NAME`, `MCP_SERVER`, `HOME_ENV`, `data_dir_from`) or
  `registry::data_dir()`. A literal reintroduced anywhere re-creates the
  collision for that one file.
- Every home-relative path honours `ORCHESTRAI_HOME`. Tests depend on it to stay
  out of the real data folder.
- `check-release-version.mjs` asserts that no updater feed is configured. Until
  the fork has its own signed feed, a feed in `tauri.conf.json` is a way to
  install stock Warpforge.
