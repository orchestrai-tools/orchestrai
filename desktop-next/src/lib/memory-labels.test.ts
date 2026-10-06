import { describe, expect, it } from "vitest";
import { collectTags, filterMemories, proposalEffect, proposalTargets, splitSnippet } from "./memory-labels";
import type { Memory } from "@warpforge/protocol";

describe("splitSnippet", () => {
  it("marks the highlighted runs and keeps the rest plain", () => {
    expect(splitSnippet("issue <b>#82</b> is open")).toEqual([
      { at: 0, match: false, text: "issue " },
      { at: 6, match: true, text: "#82" },
      { at: 9, match: false, text: " is open" },
    ]);
  });

  it("leaves an unclosed tag as text", () => {
    expect(splitSnippet("a <b>b")).toEqual([{ at: 0, match: false, text: "a <b>b" }]);
  });
});

describe("proposalTargets", () => {
  it("splits and trims comma-separated ids", () => {
    const proposal = {
      created_at: 1,
      id: 1,
      proposal_type: "merge",
      reason: null,
      status: "pending",
      target_ids: null as string | null,
    };
    expect(proposalTargets({ ...proposal, target_ids: "a, b ,,c" })).toEqual(["a", "b", "c"]);
    expect(proposalTargets(proposal)).toEqual([]);
  });
});

describe("collectTags", () => {
  it("orders tags by how many memories carry them", () => {
    const base = {
      content: "",
      createdAt: 0,
      id: "",
      kind: "note",
      lastAccessed: 0,
      scope: "global",
      updatedAt: 0,
      tags: [] as string[],
    };
    expect(collectTags([{ ...base, tags: ["b", "a"] }, { ...base, tags: ["b"] }])).toEqual(["b", "a"]);
  });
});

describe("proposalEffect", () => {
  const base = { created_at: 1, id: 1, reason: null, status: "pending", target_ids: "" };

  it("applies for duplicate, stale and delete, and not for merge", () => {
    const effect = (type: string, ids: string) => proposalEffect({ ...base, proposal_type: type, target_ids: ids });
    expect(effect("duplicate", "a,b,c")).toMatchObject({ applies: true });
    expect(effect("duplicate", "a")).toMatchObject({ applies: false });
    expect(effect("stale", "a").summary).toBe("Approving deletes 1 memory.");
    expect(effect("delete", "a,b").summary).toBe("Approving deletes 2 memories.");
    expect(effect("merge", "a,b")).toMatchObject({ applies: false });
  });
});

describe("filterMemories", () => {
  const row = (id: string, kind: string, tags: string[]): Memory => ({
    id,
    scope: "global",
    kind,
    content: id,
    createdAt: 0,
    updatedAt: 0,
    lastAccessed: 0,
    tags,
  });

  it("keeps a tagged kind while searching", () => {
    const rows = [row("a", "fact", ["ports"]), row("b", "note", ["ports"])];
    expect(filterMemories(rows, { kind: "fact", tag: "ports", searching: true }).map((item) => item.id)).toEqual(["a"]);
  });
});
