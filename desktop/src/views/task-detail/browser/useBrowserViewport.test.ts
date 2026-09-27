import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browser } from "./browserClient";
import { isFullyOnScreen, useBrowserViewport } from "./useBrowserViewport";

vi.mock("./browserClient", () => ({
  browser: {
    setBounds: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    setVisible: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  },
}));

const box = { width: 800, height: 600 };

function sighting(ratio: number, size = box) {
  return { boundingClientRect: size, intersectionRatio: ratio, isIntersecting: ratio > 0 };
}

describe("isFullyOnScreen", () => {
  it("shows the page when the placeholder is entirely on screen", () => {
    expect(isFullyOnScreen(sighting(1))).toBe(true);
  });

  it("tolerates a subpixel shortfall", () => {
    expect(isFullyOnScreen(sighting(0.9994))).toBe(true);
  });

  it("hides the page when a folded pane clips the placeholder away", () => {
    expect(isFullyOnScreen(sighting(0))).toBe(false);
  });

  it("hides the page while the placeholder is only partly visible", () => {
    expect(isFullyOnScreen(sighting(0.5))).toBe(false);
    expect(isFullyOnScreen(sighting(0.99))).toBe(false);
  });

  it("hides the page when the placeholder has no size", () => {
    expect(isFullyOnScreen(sighting(1, { width: 0, height: 600 }))).toBe(false);
  });
});

describe("useBrowserViewport", () => {
  let report: (entries: ReturnType<typeof sighting>[]) => void;

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("follows the newest record when an unfold arrives in one batch", () => {
    const ref = { current: document.createElement("div") };
    renderHook(() => useBrowserViewport("p:tab", ref));
    act(() => report([sighting(0.99), sighting(1)]));
    expect(vi.mocked(browser.setVisible).mock.calls).toEqual([["p:tab", true]]);
  });

  it("shows the next tab at once when the placeholder is already on screen", () => {
    const ref = { current: document.createElement("div") };
    const { rerender } = renderHook(({ id }) => useBrowserViewport(id, ref), {
      initialProps: { id: "p:a" },
    });
    act(() => report([sighting(1)]));
    rerender({ id: "p:b" });
    expect(vi.mocked(browser.setVisible)).toHaveBeenLastCalledWith("p:b", true);
  });
});
