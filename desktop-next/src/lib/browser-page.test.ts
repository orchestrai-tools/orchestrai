import { describe, expect, it } from "vitest";
import {
  browserNavOnState,
  browserTabLabel,
  canGoBack,
  canGoForward,
  emptyBrowserNav,
  isStartUrl,
  loadStalled,
} from "./browser-page";

describe("browser page", () => {
  it("treats an empty address as the start page", () => {
    expect(isStartUrl("")).toBe(true);
    expect(isStartUrl("https://")).toBe(true);
    expect(isStartUrl("http://localhost:5174")).toBe(false);
  });

  it("keeps Back off on the first page, then Stop while that page loads", () => {
    const first = browserNavOnState(emptyBrowserNav(), "http://localhost:4000", true);
    expect(canGoBack(first)).toBe(false);
    expect(canGoForward(first)).toBe(false);
    expect(first.loading).toBe(true);
    const second = browserNavOnState(first, "http://localhost:4001", true);
    expect(canGoBack(second)).toBe(true);
    const back = browserNavOnState(second, second.entries[0] ?? "", true, -1);
    expect(back.pos).toBe(0);
    expect(canGoForward(back)).toBe(true);
    expect(browserNavOnState(back, back.entries[0] ?? "", false).loading).toBe(false);
  });

  it("names a tab from its title, then its host", () => {
    expect(browserTabLabel(undefined, "")).toBe("New tab");
    expect(browserTabLabel(undefined, "http://localhost:4000")).toBe("localhost:4000");
    expect(browserTabLabel("Board", "http://localhost:4000")).toBe("Board");
  });

  it("calls a load stalled after fifteen seconds", () => {
    expect(loadStalled(0, 14_999)).toBe(false);
    expect(loadStalled(0, 15_000)).toBe(true);
  });
});
