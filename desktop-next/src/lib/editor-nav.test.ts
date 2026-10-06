import { describe, expect, it } from "vitest";
import { editLine, listStep, locationFromDefinition, pathFromFileUri } from "./editor-nav";

describe("editor navigation", () => {
  it("reads a definition location and its path inside the project", () => {
    const location = locationFromDefinition({
      uri: "file:///repo/src/app.ts",
      range: { start: { line: 12, character: 4 } },
    });
    expect(location?.line).toBe(12);
    expect(pathFromFileUri(location!.uri, "/repo")).toBe("src/app.ts");
    expect(
      locationFromDefinition([
        { targetUri: "file:///repo/a.ts", targetSelectionRange: { start: { line: 1 } } },
      ])?.line,
    ).toBe(1);
    expect(locationFromDefinition(null)).toBeNull();
  });

  it("opens a file edit on its first new line", () => {
    expect(editLine(undefined)).toBe(0);
    expect(editLine([{ newStart: 1 }])).toBe(0);
    expect(editLine([{ newStart: 12 }])).toBe(11);
  });

  it("steps a list with j and k, and not with other keys", () => {
    expect(listStep("j")).toBe(1);
    expect(listStep("k")).toBe(-1);
    expect(listStep("x")).toBe(0);
  });
});
