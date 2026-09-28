import { describe, expect, it } from "vitest";

import type { SessionUpdate } from "../protocol";
import { appendCoalescedUpdate, coalesceUpdates } from "./sessionStream";

const tool = (
  id: string,
  status: "pending" | "in_progress" | "completed",
  content?: string,
): SessionUpdate => ({
  kind: "tool_call",
  tool_call_id: id,
  title: "Compact conversation",
  status,
  tool_kind: "think",
  content,
});

function statuses(updates: SessionUpdate[]): Record<string, string> {
  return Object.fromEntries(
    updates.flatMap((u) => (u.kind === "tool_call" ? [[u.tool_call_id, u.status]] : [])),
  );
}

describe("settling tool calls at turn end", () => {
  it("completes a call its turn left running, as a stored compaction did", () => {
    const history: SessionUpdate[] = [
      { kind: "user_message", text: "/compact" },
      tool("compact", "in_progress"),
      tool("compact", "completed"),
      tool("compact", "in_progress", '{"preTokens":831504}'),
      { kind: "turn_ended", stop_reason: "end_turn" },
    ];

    expect(statuses(coalesceUpdates(history))).toEqual({ compact: "completed" });
  });

  it("fails calls left open by a cancelled turn", () => {
    const live = appendCoalescedUpdate([tool("read", "pending")], {
      kind: "turn_ended",
      stop_reason: "cancelled",
    });

    expect(statuses(live)).toEqual({ read: "failed" });
  });

  it("leaves earlier turns and the running turn alone", () => {
    const updates = coalesceUpdates([
      tool("old", "in_progress"),
      { kind: "turn_ended", stop_reason: "cancelled" },
      tool("done", "completed"),
      { kind: "turn_ended", stop_reason: "end_turn" },
      tool("running", "in_progress"),
    ]);

    expect(statuses(updates)).toEqual({ old: "failed", done: "completed", running: "in_progress" });
  });
});
