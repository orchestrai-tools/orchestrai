import { describe, expect, it } from "vitest";
import { diagnosticSpan, offsetAt } from "./diagnostic-range";

describe("diagnosticSpan", () => {
  const text = "alpha\nbeta\n";

  it("maps a language-server line and character onto the document", () => {
    expect(offsetAt(text, 1, 1)).toBe(7);
    expect(diagnosticSpan(text, { fromLine: 1, fromChar: 0, toLine: 1, toChar: 4 })).toEqual({
      from: 6,
      to: 10,
    });
  });

  it("marks one character when the server range is empty", () => {
    expect(diagnosticSpan(text, { fromLine: 0, fromChar: 2, toLine: 0, toChar: 2 })).toEqual({
      from: 2,
      to: 3,
    });
  });
});
