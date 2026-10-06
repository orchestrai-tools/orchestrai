import type { SessionUpdate } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";
import { latestCommands } from "./commands";

describe("latestCommands", () => {
  it("uses the newest command list the agent sent", () => {
    const updates = [
      { kind: "available_commands", commands: [{ name: "old", description: "Old" }] },
      { kind: "agent_text", text: "working" },
      { kind: "available_commands", commands: [{ name: "review", description: "Review the diff" }] },
    ] as SessionUpdate[];
    expect(latestCommands(updates).map((command) => command.name)).toEqual(["review"]);
    expect(latestCommands([])).toEqual([]);
  });
});
