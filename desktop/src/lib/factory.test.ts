import { describe, expect, it } from "vitest";

import type { EnqueueResult, RunnerWait, TaskInfo, WorkflowMeta } from "@/protocol";

import {
  canRunAgain,
  clockTime,
  enqueueSummary,
  factoryStage,
  factoryWait,
  isFactoryTask,
  locationNote,
  queuedOrder,
  resolveLocation,
  waitSentence,
} from "./factory";

const verifying = { verifyRequired: true } as WorkflowMeta;
const plain = {} as WorkflowMeta;

function task(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    agent: "claude",
    createdAt: 0,
    filesChanged: 0,
    id: "t1",
    project: "demo",
    prompt: "",
    status: "running",
    tags: ["runner", "workflow:review-loop"],
    updatedAt: 0,
    ...overrides,
  } as TaskInfo;
}

function run(stage: string, round = 0) {
  return {
    maxRounds: 3,
    round,
    stage,
    workflowId: "w",
    workflowName: "W",
  } as TaskInfo["workflowRun"];
}

describe("waitSentence", () => {
  it("words every reason a queued task can wait for", () => {
    const at = 1_700_000_000;
    const cases: [RunnerWait, string][] = [
      [{ inUse: 1, kind: "slots", limit: 1 }, "waiting for a free slot"],
      [{ kind: "open_prs", limit: 3, open: 3 }, "3 draft PRs are open — merge or close one"],
      [{ kind: "open_prs", limit: 1, open: 1 }, "1 draft PR is open — merge or close one"],
      [
        { kind: "daily", limit: 10, nextAt: at, started: 10 },
        `10 tasks started in the last 24 hours — next at ${clockTime(at)}`,
      ],
      [
        { agent: "claude", kind: "quota", resetsAt: at, usedPct: 85 },
        `claude is near its quota — starts after ${clockTime(at)}`,
      ],
      [{ agent: "codex", kind: "quota", usedPct: 100 }, "codex is out of its quota"],
      [{ freeGb: 4, kind: "disk", minGb: 25 }, "low disk space — 4 GB free, keeps at least 25 GB"],
      [{ cause: "dirty", kind: "checkout_busy" }, "your project folder has uncommitted changes"],
      [{ cause: "in_use", kind: "checkout_busy" }, "another task is using your project folder"],
      [
        { cause: "task_running", detail: "Fix login", kind: "checkout_busy" },
        "“Fix login” is running in your project folder",
      ],
      [
        { kind: "checkout_held", reason: "left on a branch" },
        "your project folder needs you first",
      ],
      [
        { error: "bad yaml", kind: "workflow_invalid", workflow: "mine" },
        "the workflow template “mine” can't be used",
      ],
      [{ detail: "no agent is set up", kind: "other" }, "no agent is set up"],
    ];
    for (const [wait, sentence] of cases) expect(waitSentence(wait)).toBe(sentence);
  });

  it("prefers what holds the whole project, and says nothing past the queue", () => {
    const own: RunnerWait = { cause: "dirty", kind: "checkout_busy" };
    const project: RunnerWait = { inUse: 1, kind: "slots", limit: 1 };
    expect(factoryWait({ state: "queued", wait: own }, { hold: project })).toEqual(project);
    expect(factoryWait({ state: "queued", wait: own }, { hold: null })).toEqual(own);
    expect(factoryWait({ state: "queued", wait: null }, { hold: null })).toBeNull();
    expect(factoryWait({ state: "running", wait: own }, { hold: project })).toBeNull();
  });
});

describe("factoryStage", () => {
  it("names where a Factory task is", () => {
    expect(factoryStage(task({ status: "queued" }), { prNumber: null, state: "queued" })).toBe(
      "Queued",
    );
    expect(factoryStage(task({ workflowRun: run("implement") }), { state: "running" })).toBe(
      "Implementing",
    );
    expect(factoryStage(task({ workflowRun: run("verify") }), null)).toBe("Verifying");
    expect(factoryStage(task({ workflowRun: run("review", 2) }), null)).toBe(
      "Reviewing · round 2/3",
    );
    expect(factoryStage(task({ workflowRun: run("fix", 2) }), null)).toBe("Fixing · round 2/3");
    expect(factoryStage(task({ workflowRun: run("done") }), { state: "delivering" })).toBe(
      "Opening PR",
    );
    expect(
      factoryStage(task({ workflowRun: run("done") }), { prNumber: 41, state: "delivered" }),
    ).toBe("PR #41");
    expect(factoryStage(task({ workflowRun: run("done") }), null, 41)).toBe("PR #41");
    expect(factoryStage(task({ workflowRun: run("done") }), null)).toBeNull();
  });
});

describe("where a Factory task runs", () => {
  it("takes the project folder automatically only for a template that tests the app", () => {
    expect(resolveLocation("auto", "default", verifying)).toBe("checkout");
    expect(resolveLocation("auto", "default", plain)).toBe("worktree");
    expect(resolveLocation("worktree", "default", verifying)).toBe("worktree");
    expect(resolveLocation("auto", "checkout", plain)).toBe("checkout");
    expect(locationNote("checkout", "default", true)).toBe(
      "Runs in your project folder, because it tests the running app.",
    );
    expect(locationNote("worktree", "worktree", false)).toBe(
      "Runs in a background copy of the repository.",
    );
  });
});

describe("Factory task helpers", () => {
  it("tells a Factory task from its stages and offers Run again only after a failure", () => {
    expect(isFactoryTask({ tags: ["workflow:review-loop"] })).toBe(true);
    expect(isFactoryTask({ tags: ["workflow-stage"] })).toBe(false);
    expect(canRunAgain(task({ status: "interrupted" }))).toBe(true);
    expect(canRunAgain(task({ status: "blocked" }))).toBe(true);
    expect(canRunAgain(task({ status: "waiting", workflowRun: run("done") }))).toBe(false);
    expect(canRunAgain(task({ status: "interrupted", tags: [] }))).toBe(false);
    expect(
      queuedOrder([
        { state: "queued", taskId: "a" },
        { state: "running", taskId: "b" },
        { state: "queued", taskId: "c" },
      ]),
    ).toEqual(["a", "c"]);
  });

  it("sums up what a start request did", () => {
    const result = {
      created: [
        { started: true, taskId: "1" },
        { started: true, taskId: "2" },
        { started: true, taskId: "3" },
        { started: false, taskId: "4" },
      ],
      skipped: [{ itemId: "b", number: 5, reason: { kind: "already_in_factory" } }],
    } as EnqueueResult;
    expect(enqueueSummary(result)).toBe("3 started · 1 queued · 1 already in Factory");
    expect(enqueueSummary({ ...result, created: [], skipped: [] })).toBe("Nothing to start");
  });
});
