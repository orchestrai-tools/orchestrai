import { describe, expect, it } from "vitest";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "./sidebar-width";

describe("clampSidebarWidth", () => {
  it("keeps a drag inside the old desktop's range", () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampSidebarWidth(350.4)).toBe(350);
    expect(clampSidebarWidth("wide")).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});
