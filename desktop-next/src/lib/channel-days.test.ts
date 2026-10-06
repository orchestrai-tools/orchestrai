import { describe, expect, it } from "vitest";
import { continuesAuthor, withDayBreaks } from "./channel-days";

describe("withDayBreaks", () => {
  it("splits messages that landed on different days", () => {
    const now = new Date(2026, 9, 2, 15, 0, 0);
    const yesterday = Math.floor(new Date(2026, 9, 1, 9, 0, 0).getTime() / 1000);
    const today = Math.floor(new Date(2026, 9, 2, 10, 0, 0).getTime() / 1000);
    const items = withDayBreaks(
      [
        { id: "a", at: yesterday, body: "old" },
        { id: "b", at: today, body: "new" },
      ],
      now,
    );
    expect(items.map((item) => (item.kind === "day" ? item.label : item.message.id))).toEqual([
      "Yesterday",
      "a",
      "Today",
      "b",
    ]);
  });

  it("keeps the name off a second message from the same person", () => {
    const now = new Date(2026, 9, 2, 15, 0, 0);
    const at = Math.floor(now.getTime() / 1000);
    const items = withDayBreaks(
      [
        { id: "a", at, author: "you", role: "human" },
        { id: "b", at: at + 1, author: "you", role: "human" },
        { id: "c", at: at + 2, author: "claude", role: "agent" },
      ],
      now,
    );
    expect(items.map((_, index) => continuesAuthor(items, index))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});
