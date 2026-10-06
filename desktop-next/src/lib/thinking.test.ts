import { describe, expect, it } from "vitest";
import type { SessionUpdate } from "@warpforge/protocol";
import { activeThinkingIndex } from "./thinking";

const thought = (text: string): SessionUpdate => ({ kind: "agent_thought", text });

describe("activeThinkingIndex", () => {
  it("keeps only the latest thought open until an answer arrives", () => {
    const updates: SessionUpdate[] = [
      thought("first"),
      { kind: "tool_call", tool_call_id: "t", title: "read", status: "completed", tool_kind: "read" },
      thought("second"),
    ];
    expect(activeThinkingIndex(updates, true)).toBe(2);
    expect(activeThinkingIndex([thought("done"), { kind: "agent_text", text: "Answer" }], true)).toBeNull();
    expect(activeThinkingIndex([thought("done")], false)).toBeNull();
  });
});
