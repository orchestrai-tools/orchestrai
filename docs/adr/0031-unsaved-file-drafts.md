# 0031 — Unsaved file text belongs to its checkout and path

**Status:** accepted (2026-10-06)

## Context

The Files page held one draft in component state. Selecting another file
loaded its disk contents over that draft; leaving the page also lost the text.
An isolated task could display one checkout while Save and Search used the
project checkout, so the editor's apparent save did not change the shown file.

## Decisions

Keep unsaved text in a dedicated store scoped by project, task, worktree and
relative path. Use browser session storage to recover edits after a reload,
without retaining another user's drafts across browser sessions. Open tabs
remain in the existing session store. Mark all dirty tabs, and require an
explicit discard before closing one. Rename moves its drafts; deletion clears
only drafts at that path or below it. A completed save clears the submitted
draft only if no newer edit has arrived.

Every file operation uses the same checkout selection: a named task takes
precedence, otherwise the named project. A missing named task must never fall
back to the project's checkout. Rename refuses an existing destination,
including a dangling symlink, rather than replacing it without consent.

## Invariants

1. Tab switches and page navigation never discard unsaved text.
2. Drafts from different worktrees cannot overwrite each other.
3. Read, write, search and rename agree on the checkout.
4. A failed save retains the draft, and an older save cannot clear newer text.
5. Rename never intentionally replaces an existing destination.
