import {
  demoDocsList,
  demoDocsSeed,
  demoDocsWrite,
  demoDocText,
} from "@warpforge/daemon/demo-docs";
import { describe, expect, it } from "vitest";

describe("demo docs", () => {
  it("adds a saved page to the index and keeps its text", () => {
    expect(demoDocText(demoDocsSeed(), "guide.mdx")).toContain("The columns stay.");
    const docs = demoDocsSeed();
    demoDocsWrite(docs, "NOTES.md", "## Notes\n\nKept.\n");
    expect(demoDocsList(docs).map((doc) => doc.title)).toEqual([
      "Pull request",
      "Notes",
      "Demo",
      "Docs stay files",
      "Guide",
      "Shell plan",
      "Sketch the shell",
    ]);
    expect(demoDocText(docs, "NOTES.md")).toBe("## Notes\n\nKept.\n");
    const notes = demoDocsList(docs).find((doc) => doc.path === "NOTES.md");
    expect(notes?.updated).toBeGreaterThan(0);
  });
});
