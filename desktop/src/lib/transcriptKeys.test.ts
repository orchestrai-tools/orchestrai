import { describe, expect, it } from "vitest";

import type { SessionUpdate } from "../protocol";
import { capSessionUpdates, deriveTranscriptRows, MAX_SESSION_UPDATES } from "./sessionStream";
import { droppedFromFront } from "./transcriptKeys";

const text = (value: string): SessionUpdate => ({ kind: "agent_text", text: value });
const user = (value: string): SessionUpdate => ({ kind: "user_message", text: value });

describe("droppedFromFront", () => {
  it("counts updates the cap sliced off the front", () => {
    const previous = [user("a"), text("b"), user("c"), text("d")];
    expect(droppedFromFront(previous, previous.slice(2))).toBe(2);
  });

  it("still counts when the new front was replaced by a copy", () => {
    const previous = [user("a"), text("b"), user("c"), text("d")];
    const next = [{ ...previous[1] }, ...previous.slice(2)];
    expect(droppedFromFront(previous, next)).toBe(1);
  });

  it("is zero when the front is untouched", () => {
    const previous = [user("a"), text("b")];
    expect(droppedFromFront(previous, [...previous, user("c")])).toBe(0);
  });

  it("is zero for a transcript rebuilt from scratch", () => {
    expect(droppedFromFront([user("a"), text("b")], [user("a"), text("b")])).toBe(0);
    expect(droppedFromFront([user("a")], [])).toBe(0);
  });
});

describe("row keys across the session cap", () => {
  it("keep naming the same update after the cap drops the front", () => {
    const full = Array.from({ length: MAX_SESSION_UPDATES }, (_, index) =>
      index % 2 ? text(`t${index}`) : user(`u${index}`),
    );
    const before = deriveTranscriptRows(full, new Map(), null, null, false);
    const grown = capSessionUpdates([...full, user("new")]);
    const dropped = droppedFromFront(full, grown);
    const after = deriveTranscriptRows(grown, new Map(), null, null, false, null, dropped);
    const idOf = (rows: typeof before, value: string) =>
      rows.find(
        (row) =>
          row.kind === "update" && "text" in row.entry.update && row.entry.update.text === value,
      )?.id;

    expect(dropped).toBe(1);
    expect(idOf(after, "t1999")).toBe(idOf(before, "t1999"));
    expect(idOf(after, "u1000")).toBe(idOf(before, "u1000"));
  });
});
