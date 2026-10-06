import { describe, expect, it } from "vitest";
import type { TaskInfo } from "@warpforge/protocol";
import { agentFamily, childCount, childLabel, isLead, memberLabel } from "./agent-family";

function task(patch: Partial<TaskInfo> & Pick<TaskInfo, "id">): TaskInfo {
  return {
    project: "app",
    prompt: patch.id,
    agent: "claude",
    status: "running",
    tags: [],
    title: patch.id,
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    blockedReason: null,
    ...patch,
  };
}

describe("agent family", () => {
  it("lists the lead and its workers, and skips an advisor", () => {
    const tasks = [
      task({ id: "lead", tags: ["orchestrator-chat"] }),
      task({ id: "worker", parentTaskId: "lead", agent: "codex" }),
      task({ id: "advisor", parentTaskId: "lead", origin: "advisor", agent: "claude" }),
    ];
    expect(agentFamily("worker", tasks).map((item) => item.id)).toEqual(["lead", "worker"]);
    expect(memberLabel(tasks[1], 1, tasks[0])).toBe("codex");
    expect(isLead(tasks[0], 0)).toBe(true);
    expect(isLead(tasks[1], 0)).toBe(false);
    expect(childCount("lead", tasks)).toBe(1);
    expect(childLabel(1, false)).toBe("1 worker");
    expect(childLabel(2, true)).toBe("2 stages");
    expect(childLabel(0, false, true)).toBe("Lead");
    expect(childLabel(0, false, false)).toBe("");
  });
});
