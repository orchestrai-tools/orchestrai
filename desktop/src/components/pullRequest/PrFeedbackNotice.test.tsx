import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import type { TaskInfo, TaskPullRequest } from "@/protocol";
import { usePrFeedbackStore } from "@/store/prFeedback";

import { PrFeedbackNotice } from "./PrFeedbackNotice";

const task: TaskInfo = {
  agent: "codex",
  blockedReason: null,
  createdAt: 1,
  filesChanged: 0,
  id: "t1",
  project: "warpforge",
  prompt: "Fix the sidebar",
  status: "running",
  tags: [],
  title: "Fix the sidebar",
  updatedAt: 1,
  worktree: "/repo/.warpforge/worktrees/t1",
};

const pr: TaskPullRequest = {
  checks: "failing",
  failedChecks: [{ name: "CI / test", state: "failing", url: "https://ci.test/1" }],
  headOid: "abc",
  number: 12,
  openComments: [
    {
      author: { login: "alice" },
      body: "Rename this.",
      createdAt: "",
      id: "c1",
      kind: "review_comment",
      line: 4,
      path: "src/a.ts",
      replies: [],
      url: "",
    },
  ],
  state: "open",
  title: "Fix the sidebar",
  url: "https://github.com/acme/widgets/pull/12",
};

type Internals = {
  setState: (patch: { taskPullRequests: Record<string, TaskPullRequest> }) => void;
};
const internals = daemon as unknown as Internals;

afterEach(() => {
  vi.restoreAllMocks();
  act(() => internals.setState({ taskPullRequests: {} }));
  act(() => usePrFeedbackStore.setState({ handledByTask: {} }));
});

describe("PrFeedbackNotice", () => {
  it("sends one prompt into the task's own session, then stays quiet", async () => {
    const request = vi.spyOn(daemon, "request").mockResolvedValue(null);
    act(() => internals.setState({ taskPullRequests: { t1: pr } }));
    const { container } = render(<PrFeedbackNotice task={task} />);

    expect(screen.getByText("PR #12: 1 check failed · 1 new comment")).toBeInTheDocument();
    expect(screen.getByText(/waits until its turn ends/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Send to agent" }));

    expect(request).toHaveBeenCalledTimes(1);
    const [method, params] = request.mock.calls[0] as [string, { task_id: string; text: string }];
    expect(method).toBe("session.prompt");
    expect(params.task_id).toBe("t1");
    expect(params.text).toContain("1. CI / test\n   https://ci.test/1");
    expect(params.text).toContain("1. src/a.ts:4 — alice\n   Rename this.");
    expect(container).toBeEmptyDOMElement();
  });

  it("dismisses without sending anything", async () => {
    const request = vi.spyOn(daemon, "request").mockResolvedValue(null);
    act(() => internals.setState({ taskPullRequests: { t1: pr } }));
    const { container } = render(<PrFeedbackNotice task={task} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(request).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
