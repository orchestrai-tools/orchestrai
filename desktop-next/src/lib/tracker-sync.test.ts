import { describe, expect, it } from "vitest";

import { trackerSyncMessage } from "./tracker-sync";

describe("trackerSyncMessage", () => {
  it("says when nothing changed", () => {
    expect(trackerSyncMessage({ imported: 0, updated: 0 })).toBe("Tracker items are up to date");
  });

  it("counts imported issues and refreshed items", () => {
    expect(trackerSyncMessage({ imported: 1, updated: 0 })).toBe("Imported 1 new issue");
    expect(trackerSyncMessage({ imported: 0, updated: 3 })).toBe("Refreshed 3 items");
    expect(trackerSyncMessage({ imported: 2, updated: 1 })).toBe(
      "Imported 2 new issues and refreshed 1 item",
    );
  });
});
