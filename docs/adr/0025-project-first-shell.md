# 0025 — Project-first desktop shell

**Status:** accepted (2026-10-01)

## Context

The desktop UI grew as a task tree in one sidebar, with Mission Control, Inbox, Automations, and Memory as global views beside it. A project was a row in that tree, not the place work lives. The shell in `experiments/orchestrai-shell` and `docs/design/DESIGN-PHILOSOPHY.md` flip that: a project is the namespace, Home is where attention crosses projects, and the window is a fixed set of regions.

The rewrite is a second frontend, `desktop-next/`, on the same daemon. The wire types and the WebSocket client moved to `packages/protocol` and `packages/daemon` so both frontends, and the website demo, share them. `desktop/src/daemon` and `desktop/src/protocol` re-export those packages, so the current app's imports keep resolving.

## Decisions

**Projects are the namespace.** The title bar holds a pinned Home tab and one tab per open project, or a dropdown that names the current project. The choice is per install (`projectNav`), not two apps. Each project remembers its page.

**Home replaces Mission Control.** Home lists what is waiting and every task. Opening a task switches into that project's tab. Pinned sessions stay a view on Home until the Sessions page exists.

**One action list.** The palette, the app menu, and shortcuts read the same actions. ⌘K opens the palette. Commit, which ⌘K used to open, is ⌘↵ in the commit box. That is the one deliberate shortcut change.

**The daemon package does not import the UI.** Query invalidation, forgotten workspace sessions, and tracker notices are callbacks (`onInvalidate`, `onTaskRemoved`, `onNotice`) the app registers at startup.

**The old frontend stays until a later release.** Tauri can run the new UI via `src-tauri/tauri.next.conf.json`. Removing `desktop/src` waits, because the website still compiles those components.

## Rejected

An in-place rewrite behind a flag, and a single branch that deletes the old shell before the new one can boot. Both make the shipping app the construction site.
