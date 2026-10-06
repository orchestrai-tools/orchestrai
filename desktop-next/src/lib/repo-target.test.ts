import { describe, expect, it } from "vitest";

import { repoTarget, targetKey, targetTaskId } from "./repo-target";

describe("repoTarget", () => {
  it("prefers the open task", () => {
    expect(repoTarget("t1", "demo")).toEqual({ task_id: "t1" });
  });

  it("falls back to the project checkout", () => {
    expect(repoTarget("", "demo")).toEqual({ project: "demo" });
  });

  it("keys a task and a project of the same name apart", () => {
    expect(targetKey({ task_id: "demo" })).not.toBe(targetKey({ project: "demo" }));
    expect(targetTaskId({ project: "demo" })).toBe("");
    expect(targetTaskId({ task_id: "t1" })).toBe("t1");
  });
});
