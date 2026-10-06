import { demoExternalSessions, demoResumeTask, demoShellCwd } from "@warpforge/daemon/demo-shell";
import { describe, expect, it } from "vitest";

describe("demoShellCwd", () => {
  const tasks = [{ id: "demo-task", worktree: "feat/shell" }];

  it("uses the open task's worktree", () => {
    expect(demoShellCwd(tasks, "demo-task")).toBe("/demo/feat/shell");
  });

  it("uses the project directory when no task is open", () => {
    expect(demoShellCwd(tasks, "")).toBe("/demo");
  });

  it("lists an OpenCode session beside Claude", () => {
    expect(demoExternalSessions(10_000).map((session) => session.agent)).toEqual([
      "claude",
      "opencode",
      "goose",
      "pi",
    ]);
  });

  it("turns a saved session into a waiting task", () => {
    const resumed = demoResumeTask({
      agent: "claude",
      project: "demo",
      session_id: "demo-session",
      title: "Earlier sketch",
    });
    expect(resumed.taskId.startsWith("resume-")).toBe(true);
    expect(resumed.task).toMatchObject({
      project: "demo",
      status: "waiting",
      tags: ["resumed"],
      title: "Earlier sketch",
    });
  });
});
