import { describe, expect, it } from "vitest";
import {
  linkedWorkItem,
  modelChoices,
  runPlace,
  splitConfigPicks,
  useTaskDraft,
  worktreeBaseFrom,
} from "./new-task";

describe("new task picks", () => {
  it("maps the base choice onto the worktree the daemon expects", () => {
    expect(worktreeBaseFrom("")).toBeUndefined();
    expect(worktreeBaseFrom("origin")).toEqual({ kind: "origin" });
    expect(worktreeBaseFrom("main")).toEqual({ kind: "existing", branch: "main" });
  });

  it("sends the model separately from the other selectors", () => {
    const options = [
      { id: "model", name: "Model", currentValue: "sonnet", options: [] },
      { id: "effort", name: "Effort", currentValue: "low", options: [] },
    ];
    expect(splitConfigPicks(options, { model: "opus", effort: "high" })).toEqual({
      model: "opus",
      overrides: { effort: "high" },
    });
    expect(modelChoices(options)).toEqual([]);
    expect(
      modelChoices([{ id: "model", name: "Model", currentValue: "", options: [{ value: "opus", name: "Opus" }] }]),
    ).toEqual([{ value: "opus", name: "Opus" }]);
  });

  it("says where the task will run", () => {
    expect(runPlace({ mode: "single", worktree: false, base: "", location: "default", tests: false })).toBe(
      "Runs in your current checkout.",
    );
    expect(runPlace({ mode: "single", worktree: true, base: "origin", location: "default", tests: false })).toBe(
      "Runs in an isolated worktree on a new branch from origin's latest.",
    );
    expect(runPlace({ mode: "orchestrator", worktree: false, base: "", location: "default", tests: false })).toBe(
      "Lead and workers share your current checkout.",
    );
    expect(runPlace({ mode: "factory", worktree: false, base: "", location: "default", tests: true })).toBe(
      "Runs in your project folder, because it tests the running app.",
    );
  });

  it("opens a Factory task on a chosen workflow", () => {
    useTaskDraft.getState().open("", "review-loop");
    expect(useTaskDraft.getState().workflowId).toBe("review-loop");
    expect(useTaskDraft.getState().text).toBe("");
    expect(useTaskDraft.getState().workItem).toBeNull();
  });

  it("carries the backlog item a task starts from, for its project only", () => {
    const item = { id: "item-3", project: "demo", number: 3 };
    useTaskDraft.getState().open("Fix it", "", item);
    expect(useTaskDraft.getState().workItem).toEqual(item);
    expect(linkedWorkItem(item, "demo")).toBe("item-3");
    expect(linkedWorkItem(item, "other")).toBeNull();
    expect(linkedWorkItem(null, "demo")).toBeNull();
  });
});
