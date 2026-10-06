import { describe, expect, it } from "vitest";
import { docFolder, docsMatching } from "./doc-folders";

describe("doc folders", () => {
  it("puts plans, transcripts, and decisions in their own groups", () => {
    expect(docFolder("plans/shell.md")).toBe("Plans");
    expect(docFolder("transcripts/sketch-the-shell.md")).toBe("Transcripts");
    expect(docFolder("docs/adr/0026-docs.md")).toBe("Decisions");
    expect(docFolder("DECISIONS.md")).toBe("Decisions");
    expect(docFolder("README.md")).toBe("Wiki");
    expect(docFolder(".github/pull_request_template.md")).toBe("Wiki");
  });

  it("matches a title or a path and leaves the rest", () => {
    const docs = [
      { path: "guide.mdx", title: "Guide" },
      { path: "plans/shell.md", title: "Shell plan" },
    ];
    expect(docsMatching(docs, "  SHELL ")).toEqual([
      { path: "plans/shell.md", title: "Shell plan" },
    ]);
    expect(docsMatching(docs, "mdx")).toEqual([{ path: "guide.mdx", title: "Guide" }]);
    expect(
      docsMatching(
        [{ path: "guide.mdx", title: "Guide", snippet: "## Guide The columns stay." }],
        "columns stay",
      ).map((doc) => doc.path),
    ).toEqual(["guide.mdx"]);
    expect(docsMatching(docs, "")).toEqual(docs);
  });
});
