import { describe, expect, it } from "vitest";
import { agentActivity } from "./channel-members";

describe("agentActivity", () => {
  it("prefers the live task over one that is only waiting", () => {
    expect(
      agentActivity("claude", [
        { id: "wait", agent: "claude", status: "waiting", title: "Sketch the shell" },
        { id: "live", agent: "claude", status: "running", title: "Watch the columns" },
        { id: "other", agent: "codex", status: "running", title: "Somewhere else" },
      ]),
    ).toEqual({ text: "Working on Watch the columns", taskId: "live" });
  });

  it("is idle when the agent has no active task", () => {
    expect(
      agentActivity("claude", [
        { id: "done", agent: "claude", status: "done", title: "Ship the column" },
      ]),
    ).toEqual({ text: "Idle", taskId: null });
  });
});
