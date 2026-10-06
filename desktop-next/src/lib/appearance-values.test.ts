import { describe, expect, it } from "vitest";
import { clampBlur, clampMono, clampOpacity } from "./appearance-values";

describe("appearance clamps", () => {
  it("keeps opacity, blur, and the mono size inside the old ranges", () => {
    expect(clampOpacity(0.1)).toBe(0.6);
    expect(clampOpacity(2)).toBe(1);
    expect(clampBlur(0)).toBe(1);
    expect(clampBlur(80)).toBe(64);
    expect(clampMono(4)).toBe(9);
    expect(clampMono(30)).toBe(22);
  });
});
