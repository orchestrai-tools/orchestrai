import { describe, expect, it } from "vitest";

import {
  CHAT_BOTTOM_THRESHOLD_PX,
  createChatFollowGate,
  distanceFromBottom,
  isNearChatBottom,
  shouldFollowAfterScroll,
  topmostVisibleRowId,
  transcriptRestoreMode,
} from "./chatScroll";

describe("chat scroll following", () => {
  it("treats a viewport inside the threshold as near the bottom", () => {
    const metrics = { clientHeight: 400, scrollHeight: 1000, scrollTop: 529 };
    expect(distanceFromBottom(metrics)).toBe(71);
    expect(isNearChatBottom(metrics)).toBe(true);
  });

  it("stops following immediately when the user scrolls upward", () => {
    const metrics = { clientHeight: 400, scrollHeight: 1000, scrollTop: 590 };
    expect(isNearChatBottom(metrics)).toBe(true);
    expect(shouldFollowAfterScroll(600, metrics)).toBe(false);
  });

  it("re-enables following when scrolling down reaches the bottom zone", () => {
    const metrics = {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 600 - CHAT_BOTTOM_THRESHOLD_PX,
    };
    expect(shouldFollowAfterScroll(500, metrics)).toBe(true);
  });

  it("does not follow while the viewport remains above the bottom zone", () => {
    const metrics = { clientHeight: 400, scrollHeight: 1000, scrollTop: 400 };
    expect(shouldFollowAfterScroll(350, metrics)).toBe(false);
  });

  it("invalidates a queued follow when upward user intent arrives first", () => {
    const gate = createChatFollowGate();
    const queuedFollow = gate.issue();
    gate.cancel();
    expect(gate.isCurrent(queuedFollow)).toBe(false);
  });
});

describe("transcript restore mode", () => {
  it("restores nothing while following the live edge", () => {
    expect(transcriptRestoreMode(true, false, null)).toBe("none");
  });

  it("anchors to the toggled row while a disclosure settles, even when following", () => {
    // The same row id serves a manual toggle and an automatic fold on settle.
    expect(transcriptRestoreMode(true, true, "activity:work:tool:r1")).toBe("anchor");
    expect(transcriptRestoreMode(false, true, "activity:work:tool:r1")).toBe("anchor");
  });

  it("cannot anchor without an anchor key", () => {
    expect(transcriptRestoreMode(true, true, null)).toBe("none");
  });

  it("anchors to the row at the top of the viewport while reading", () => {
    expect(transcriptRestoreMode(false, false, null)).toBe("reading");
    expect(transcriptRestoreMode(false, false, "activity:work:tool:r1")).toBe("reading");
  });
});

describe("topmost visible row", () => {
  it("picks by geometry, not by DOM order", () => {
    const rows = [
      { id: "c", top: 400, bottom: 600 },
      { id: "a", top: -200, bottom: 50 },
      { id: "b", top: 50, bottom: 200 },
    ];
    expect(topmostVisibleRowId(rows, 500)).toBe("a");
  });

  it("skips rows wholly above or below the viewport", () => {
    const rows = [
      { id: "above", top: -300, bottom: 0 },
      { id: "below", top: 500, bottom: 700 },
      { id: "hit", top: 499, bottom: 600 },
    ];
    expect(topmostVisibleRowId(rows, 500)).toBe("hit");
  });

  it("returns null when nothing intersects", () => {
    expect(topmostVisibleRowId([{ id: "x", top: 600, bottom: 700 }], 500)).toBeNull();
  });
});
