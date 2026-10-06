import type { TaskInfo } from "@warpforge/protocol";
import { expect, test } from "vitest";

import { runStatus, STATUS_LABEL } from "./status-mark";

const task = (patch: Partial<TaskInfo> = {}): TaskInfo => ({
  id: "t",
  project: "demo",
  prompt: "test",
  title: "Test",
  agent: "codex",
  status: "waiting",
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  filesChanged: 0,
  blockedReason: null,
  ...patch,
});

test("a finished turn is Waiting until a person settles the task", () => {
  expect(STATUS_LABEL[runStatus(task())]).toBe("Waiting");
  expect(runStatus(task({ status: "running" }))).toBe("running");
  expect(runStatus(task({ settledOverride: true }))).toBe("done");
  expect(runStatus(task(), true)).toBe("review");
  expect(runStatus(task({ pendingPermission: true }))).toBe("needs-you");
});
