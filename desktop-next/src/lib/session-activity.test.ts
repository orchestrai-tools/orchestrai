import { describe, expect, it } from "vitest";
import { sessionActivity } from "./session-activity";

describe("sessionActivity", () => {
  it("names the phase of a running turn and stays quiet while a permission is open", () => {
    expect(sessionActivity([{ kind: "agent_thought", text: "The columns should stay." }])).toEqual({
      detail: "planning the next move",
      label: "thinking",
      tone: "thinking",
    });
    expect(
      sessionActivity([
        { kind: "user_message", text: "Sketch it" },
        { kind: "permission_request", request_id: "p1", title: "Edit README.md", options: ["allow"] },
      ]),
    ).toBeNull();
  });
});
