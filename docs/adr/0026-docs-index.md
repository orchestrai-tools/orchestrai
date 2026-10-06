# 0026 — Docs index

**Status:** accepted (2026-10-01)

## Context

The project-first shell needs a place to read and edit markdown in the open project. Chat rendering is not that place. The file RPCs already read and save one path. What was missing is a project-wide list of markdown files.

## Decision

`docs.list` walks the project directory and returns up to 200 markdown paths, skipping dependency and build directories. `docs.write` saves one relative `.md` path inside that directory and refuses paths that leave it. The page reads a file with `file.contents`.

## Rejected

A second document store beside the repository. The docs are the files already in the project.
