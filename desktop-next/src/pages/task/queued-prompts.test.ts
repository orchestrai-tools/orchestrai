import { describe, expect, it } from "vitest";
import { queueHeading, queueInitiator, queueSendLabel } from "./queued-prompts";

describe("queued prompt labels", () => {
  it("names one waiting message and several", () => {
    expect(queueHeading(1)).toBe("1 message waiting for the agent");
    expect(queueHeading(2)).toBe("2 messages waiting for the agent");
    expect(queueSendLabel(1)).toBe("Send now");
    expect(queueSendLabel(3)).toBe("Send all now");
  });

  it("labels a scheduled run and hides a person's own message", () => {
    expect(queueInitiator("automation")).toBe("Scheduled run");
    expect(queueInitiator("system")).toBe("OrchestrAI");
    expect(queueInitiator("user")).toBeNull();
  });
});
