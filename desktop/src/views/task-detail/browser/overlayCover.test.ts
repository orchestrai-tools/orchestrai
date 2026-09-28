import { afterEach, describe, expect, it } from "vitest";

import { findOverlays, isCovered, type Rect } from "./overlayCover";

const page: Rect = { x: 600, y: 100, width: 600, height: 700 };

describe("isCovered", () => {
  it("covers the page for any open modal, wherever it sits", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(isCovered(page, [{ rect, modal: true }])).toBe(true);
  });

  it("covers the page only where a floating overlay overlaps it", () => {
    const beside = { x: 100, y: 200, width: 200, height: 300 };
    const over = { x: 900, y: 750, width: 350, height: 80 };
    expect(isCovered(page, [{ rect: beside, modal: false }])).toBe(false);
    expect(isCovered(page, [{ rect: over, modal: false }])).toBe(true);
  });

  it("ignores an overlay that only touches the page edge or has no size", () => {
    const touching = { x: 400, y: 100, width: 200, height: 100 };
    const empty = { x: 700, y: 200, width: 0, height: 0 };
    expect(
      isCovered(page, [
        { rect: touching, modal: false },
        { rect: empty, modal: false },
      ]),
    ).toBe(false);
  });
});

describe("findOverlays", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("tells open dialogs from floating content and skips closed ones", () => {
    document.body.innerHTML = `
      <div role="dialog" data-state="open"></div>
      <div role="dialog" data-state="closed"></div>
      <div aria-modal="true"></div>
      <div data-radix-popper-content-wrapper><div role="dialog" data-state="open"></div></div>
      <ol data-sonner-toaster><li data-sonner-toast></li></ol>
    `;
    expect(findOverlays(document.body).map((o) => o.modal)).toEqual([true, true, false, false]);
  });

  it("finds nothing when no overlay is open", () => {
    document.body.innerHTML = `<ol data-sonner-toaster></ol><div role="menu" data-state="closed"></div>`;
    expect(findOverlays(document.body)).toEqual([]);
  });
});
