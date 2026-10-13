# 0033 — Scoped pages and persistent drafts

**Status:** Accepted 2026-10-12

## Context

The replacement UI initially imported all pages into its entry bundle. Editors,
Markdown, charts, and feature code were downloaded even when opening Home.
Local component state also followed whichever checkout a mounted page happened
to display. Late search or diff replies could therefore replace newer results,
and closing a page discarded text that had not been sent or saved.

Persisting a draft alone does not solve asynchronous acknowledgement: an old
Send can finish after its composer is remounted and clear a newer draft.

## Decision

`PageContent` loads each page dynamically and gives it a contained error boundary.
Its identity includes page and project, task for the task page, and the effective
checkout plus worktree for Files and Changes. Navigation remains available while
a page loads or fails. Request gates also protect successive reads within a page.

Document text uses the existing checkout/path draft store (ADR 0031), including
edits made through Docs. Typed messages use a task-keyed session-storage store.
Uploads, pending file reads, and context chips stay in memory and belong to their task. Image data is
never written to session storage. Removed tasks release their retained context.

A send has a transient task-keyed token, so remounting cannot enable a duplicate
send. Successful acknowledgement removes only matching submitted text and upload
identities. Failure restores submitted chips without overwriting other context.
Removing the task invalidates its token, preventing delayed replies from restoring
its deleted draft. Workflow barriers that accept text only reject attachments
before sending anything; normal sessions and completed-stage handoffs retain them.

## Invariants

1. A stale response cannot replace results from a newer request or another scope.
2. Local file selection and tabs never carry into another checkout.
3. Sending a checked-file commit always names those files explicitly; an empty
   selection cannot mean all changes.
4. Leaving a page does not discard an unsent message or unsaved document draft.
5. A send completion acknowledges its submitted snapshot, never newer edits.
6. In-flight send locks survive component unmount/remount, but not full reload.
7. Uploads survive page changes within the current window; full reload clears
   uploads and chips while retaining typed text. This avoids persisting binary data.
8. Pending element captures retain a task-owned subscription outside the browser
   pane and hold Send until image delivery or reported failure.
9. Error recovery does not erase retained drafts or disable shell navigation.

## Alternatives

Keeping every page mounted would retain some state but would also retain stale
subscriptions, editors, and native browser views. Clearing all state on every
navigation would avoid scope leakage while losing drafts. Persisting all upload
bytes would consume browser storage and retain images unnecessarily. None meets
the ownership and acknowledgement requirements above.

## Verification

Deferred-response component tests cover checkout changes, overlapping refreshes,
search clearing, Memory filters/pagination, draft reopening, save-versus-edit,
and Send unmount/remount with newer text/uploads. A page-crash test checks that
navigation and retry still work. Live Chrome checks cover retained document
edits, message reloads, and selected commits preserving unrelated staged files.
