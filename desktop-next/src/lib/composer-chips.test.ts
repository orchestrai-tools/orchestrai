import { describe, expect, it } from "vitest";
import type { FileDiff } from "@warpforge/protocol";
import { contextImages, diffCounts, messageWithChips, type DiffChip } from "./composer-chips";

const file: FileDiff = {
  path: "README.md",
  oldPath: null,
  status: "modified",
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: ["-old", "+new"],
      resolution: null,
    },
  ],
};

describe("composer diff chips", () => {
  it("counts added and removed lines", () => {
    expect(diffCounts(file)).toEqual({ added: 1, removed: 1 });
  });

  it("sends the reply and then each diff", () => {
    const chip: DiffChip = {
      id: "1",
      path: "README.md",
      status: "modified",
      added: 1,
      removed: 1,
      content: "diff --git a/README.md",
    };
    expect(
      messageWithChips(
        "look",
        [chip],
        [{ id: "c", label: "service:web seq 1", body: "listening" }],
      ),
    ).toBe("look\n\n```diff\ndiff --git a/README.md\n```\n\nlistening");
  });

  it("sends a chip screenshot as an image", () => {
    expect(
      contextImages([
        {
          id: "c",
          label: "button: Save",
          body: "pointed",
          image: { name: "element.png", data: "AAAA" },
        },
      ]),
    ).toEqual([{ type: "image", name: "element.png", mimeType: "image/png", data: "AAAA" }]);
  });
});
