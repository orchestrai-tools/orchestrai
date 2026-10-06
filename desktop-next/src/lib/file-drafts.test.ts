import { beforeEach, describe, expect, it } from "vitest";

import { draftScope, useFileDrafts } from "./file-drafts";

const scope = draftScope("project", "task", "/worktree");
beforeEach(() => useFileDrafts.setState({ scopes: {} }));

describe("unsaved file drafts", () => {
  it("keeps separate drafts for files and worktrees", () => {
    const store = useFileDrafts.getState();
    const other = draftScope("project", "task", "/other");
    store.edit(scope, "a.txt", "edited A", "A");
    store.edit(scope, "b.txt", "edited B", "B");
    store.edit(other, "a.txt", "other edit", "A");
    expect(useFileDrafts.getState().scopes[scope]?.["a.txt"]?.text).toBe("edited A");
    expect(useFileDrafts.getState().scopes[other]?.["a.txt"]?.text).toBe("other edit");
  });

  it("keeps edits made while a save was in flight", () => {
    const store = useFileDrafts.getState();
    store.edit(scope, "a.txt", "submitted", "original");
    store.edit(scope, "a.txt", "newer edit", "original");
    store.saved(scope, "a.txt", "submitted");
    expect(useFileDrafts.getState().scopes[scope]?.["a.txt"]).toEqual({
      text: "newer edit",
      base: "submitted",
    });
    store.saved(scope, "a.txt", "newer edit");
    expect(useFileDrafts.getState().scopes[scope]?.["a.txt"]).toBeUndefined();
  });

  it("moves nested drafts on rename and clears only discarded paths", () => {
    const store = useFileDrafts.getState();
    store.edit(scope, "src/a.txt", "A", "");
    store.edit(scope, "src-extra/b.txt", "B", "");
    store.rename(scope, "src", "lib");
    expect(useFileDrafts.getState().scopes[scope]?.["lib/a.txt"]?.text).toBe("A");
    store.forget(scope, "lib");
    expect(Object.keys(useFileDrafts.getState().scopes[scope] ?? {})).toEqual(["src-extra/b.txt"]);
  });
});
