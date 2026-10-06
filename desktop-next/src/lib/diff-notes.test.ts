import { expect, test } from "vitest";
import { anchorNote, notesFromStore } from "./diff-notes";

test("a note follows its lines when they move in the hunk", () => {
  const note = {
    startLine: 1,
    endLine: 1,
    snippet: ["+ const next = 1;"],
  };
  const moved = [" context", "+ const next = 1;", " context"];
  expect(anchorNote(note, moved)).toEqual({ startLine: 2, endLine: 2, outdated: false });
  expect(anchorNote(note, [" context"]).outdated).toBe(true);
});

test("notes written by the previous app stay readable", () => {
  const note = {
    id: "n1",
    path: "app.tsx",
    body: "Keep this",
    startLine: 1,
    endLine: 1,
    snippet: [],
  };
  const stored = notesFromStore({ state: { byTask: { task: [note] } }, version: 1 });
  expect(stored.task).toEqual([note]);
  expect(notesFromStore({ task: [note] }).task?.[0]?.body).toBe("Keep this");
});
