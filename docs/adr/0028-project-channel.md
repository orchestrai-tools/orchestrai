# 0028 — Project channel

**Status:** accepted (2026-10-01)

## Context

A channel is the room a project’s people and agents share. The desktop had no store for that room.

## Decision

`channel.list` and `channel.post` read and append messages in `.warpforge/channel.json` inside the project. Each message has an author, a role (`human` or `agent`), a body, and a time. The file is created on the first post.

## Rejected

A network relay for the first version. The room is local to the project directory the daemon already knows.
