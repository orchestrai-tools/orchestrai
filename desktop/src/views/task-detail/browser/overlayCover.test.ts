import { afterEach, describe, expect, it } from "vitest";

import { findOverlays, type Rect, visibleArea } from "./overlayCover";

const page: Rect = { x: 600, y: 100, width: 600, height: 700 };

describe("visibleArea", () => {
  it("hides the page for any open modal, wherever it sits", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(visibleArea(page, [{ rect, modal: true }])).toBeNull();
  });

  it("keeps the whole page beside a floating overlay that misses it", () => {
    const beside = { x: 100, y: 200, width: 200, height: 300 };
    expect(visibleArea(page, [{ rect: beside, modal: false }])).toEqual(page);
  });

  it("shrinks the page above a toast in its bottom corner", () => {
    const toast = { x: 900, y: 650, width: 350, height: 180 };
    expect(visibleArea(page, [{ rect: toast, modal: false }])).toEqual({
      x: 600,
      y: 100,
      width: 600,
      height: 550,
    });
  });

  it("hides the page when an overlay leaves too little of it", () => {
    const wide = { x: 500, y: 150, width: 800, height: 600 };
    expect(visibleArea(page, [{ rect: wide, modal: false }])).toBeNull();
  });

  it("ignores an overlay that only touches the page edge or has no size", () => {
    const touching = { x: 400, y: 100, width: 200, height: 100 };
    const empty = { x: 700, y: 200, width: 0, height: 0 };
    expect(
      visibleArea(page, [
        { rect: touching, modal: false },
        { rect: empty, modal: false },
      ]),
    ).toEqual(page);
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
