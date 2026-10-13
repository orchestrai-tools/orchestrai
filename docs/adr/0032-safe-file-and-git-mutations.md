# 0032 — File and git mutations preserve the work the user did not select

**Status:** accepted (2026-10-12)

## Context

The Changes page promises to commit checked files. Staging that selection
followed by a plain git commit also included any unrelated work already staged
by a terminal or agent. An explicit empty selection instead staged everything.
The hunk rejection endpoint returned after enqueuing the request, before git
finished, so sequential bulk discard became concurrent and hid failures.
The text editor treated failed UTF-8 decoding as an empty file that could then
be saved over the original binary contents.

## Decisions

An explicit commit selection must be nonempty and contain safe relative paths.
Stage those paths, then commit them with git's `--only` mode, retaining unrelated
staged and unstaged edits. Use literal pathspecs so filename punctuation cannot
select a different file. A displayed rename includes its original path as part
of the same selection. An omitted selection retains the existing explicit
commit-all behavior; clients showing a checked list should send that list.

Hunk resolution carries a completion reply through the actor. The endpoint
waits for the filesystem operation and reports its actual error. Work remains
off the actor loop (ADR 0002). The existing ordered connection path now waits
for each rejection before accepting the next, making reverse-index bulk
rejection safe.

Text reads decode UTF-8 strictly and reject NUL bytes. Text saves check the
existing file again before writing, so a stale editor cannot overwrite a file
that has become binary. A read failure is an error, not an empty document;
missing files still produce an empty document for creating new text. Images
retain their separate binary preview path.

Docs writes use the same guarded save rather than joining a path and writing
through unchecked symlinks. Its index walks regular files and real directories
only, skipping symlinks so it neither reads outside the project nor recurses
through cycles. The filesystem walk and document writes use blocking workers.

## Invariants

1. Committing checked paths never includes unrelated staged paths.
2. An explicit empty selection changes neither the index nor HEAD.
3. Filename punctuation is literal, including brackets and glob characters.
4. A successful rejection reply means the revert has already completed.
5. Rejection failures reach the caller instead of being announced as success.
6. A binary or unreadable file cannot be replaced by a blank text editor save.
7. Document indexing and saving stay inside the selected project.
