import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItem } from "../components/backlog/types";
import { daemon } from "../daemon";
import type { Snapshot, WorkflowMeta } from "../protocol";
import { useUi } from "../store/ui";
import NewTaskDialog, { type FactorySeed } from "./NewTaskDialog";

const snapshot: Snapshot = {
  agents: [
    { acpCommand: "claude", displayName: "Claude", enabled: true, id: "claude", models: [] },
  ],
  portforwards: [],
  projects: [
    {
      agentTemplates: {},
      declaredServices: [],
      name: "warpforge",
      path: "/workspace/warpforge",
      portRange: [4000, 4099],
    },
  ],
  services: [],
  tasks: [],
  terminals: [],
};

const templates: WorkflowMeta[] = [
  {
    id: "review-loop",
    maxRounds: 3,
    name: "Review loop",
    source: "builtin",
    stages: ["implement", "review", "fix"],
    valid: true,
  },
  {
    id: "verify-review-loop",
    maxRounds: 3,
    name: "Verify and review",
    source: "builtin",
    stages: ["implement", "verify", "review", "fix"],
    valid: true,
    verifyRequired: true,
  },
];

const item = (id: string, title: string): WorkItem => ({
  createdAt: 0,
  id,
  priority: "none",
  project: "warpforge",
  source: "local",
  status: "todo",
  title,
  updatedAt: 0,
});

let github = true;

function renderDialog(props: { factorySeed?: FactorySeed; backlogItemId?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewTaskDialog
        defaultProject="warpforge"
        onOpenChange={vi.fn<(open: boolean) => void>()}
        open
        snapshot={snapshot}
        initialMode="factory"
        initialPrompt={props.backlogItemId ? "Backlog item #3: Fix it" : undefined}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  github = true;
  localStorage.clear();
  useUi.setState({ autoNameTasks: false, newTaskWorktree: false, openTaskId: null });
  vi.spyOn(daemon, "request").mockImplementation(async (method) => {
    if (method === "task.create") return { started: false, taskId: "factory-task" };
    if (method === "tracker.projectSources") return { github };
    if (method === "git.branches") return { branches: ["main"], current: "main" };
    if (method === "backlog.list") {
      return {
        hasNextPage: false,
        items: [{ id: "b-1" }, { id: "b-2" }],
        page: 0,
        pageSize: 1,
        total: 2,
      };
    }
    if (method === "runner.enqueue") return { created: [], skipped: [], status: {} };
    return {};
  });
  vi.spyOn(daemon, "workflowList").mockResolvedValue(templates);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function startPrompt(text: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByPlaceholderText(/Factory task work on/), text);
  await user.click(screen.getByRole("button", { name: "Start in Factory" }));
  return user;
}

describe("NewTaskDialog in Factory mode", () => {
  it("opens a draft PR by default for a GitHub project and hands the task to the Factory", async () => {
    renderDialog({ backlogItemId: "b-3" });
    const box = await screen.findByRole("checkbox", { name: "Open a draft PR when done" });
    await waitFor(() => expect(box).toBeChecked());
    expect(screen.getByText(/Runs in a background copy of the repository/)).toBeInTheDocument();
    await startPrompt(" now");

    await waitFor(() =>
      expect(daemon.request).toHaveBeenCalledWith(
        "task.create",
        expect.objectContaining({
          backlog_item_id: "b-3",
          factory: { deliver: true, runLocation: "default" },
          workflow: "review-loop",
          worktree: true,
          worktree_base: undefined,
        }),
      ),
    );
    expect(daemon.request).not.toHaveBeenCalledWith("workItem.linkTask", expect.anything());
    expect(useUi.getState().openTaskId).toBe("factory-task");
  });

  it("with the PR off starts the workflow on the spot, exactly as before", async () => {
    github = false;
    renderDialog();
    const box = await screen.findByRole("checkbox", { name: "Open a draft PR when done" });
    await waitFor(() => expect(box).not.toBeChecked());
    await startPrompt("Refactor the cache");

    await waitFor(() =>
      expect(daemon.request).toHaveBeenCalledWith(
        "task.create",
        expect.objectContaining({ factory: undefined, workflow: "review-loop", worktree: true }),
      ),
    );
  });

  it("switches to a template that tests the app, and then runs in the project folder", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Test in the running app" }));
    expect(
      screen.getByText("Runs in your project folder, because it tests the running app."),
    ).toBeInTheDocument();
    expect(screen.getByText("Verify in browser")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change where it runs" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Background copy" }));
    expect(screen.getByText(/stops at the test and waits for you/)).toBeInTheDocument();

    await startPrompt("Check the login flow");
    await waitFor(() =>
      expect(daemon.request).toHaveBeenCalledWith(
        "task.create",
        expect.objectContaining({
          factory: { deliver: true, runLocation: "worktree" },
          workflow: "verify-review-loop",
          worktree: true,
        }),
      ),
    );
  });

  it("starts several backlog items with one configuration", async () => {
    const enqueue = vi.spyOn(daemon, "runnerEnqueue");
    const user = userEvent.setup();
    renderDialog({
      factorySeed: { items: [item("b-5", "Five"), item("b-6", "Six")], kind: "items" },
    });
    expect(await screen.findByText("Five")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Start 2 in Factory" }));

    await waitFor(() =>
      expect(enqueue).toHaveBeenCalledWith("warpforge", ["b-5", "b-6"], {
        agent: "claude",
        deliver: true,
        model: null,
        runLocation: "default",
        workflow: "review-loop",
      }),
    );
  });

  it("batches every item a filter matches", async () => {
    const enqueue = vi.spyOn(daemon, "runnerEnqueue");
    const user = userEvent.setup();
    renderDialog({ factorySeed: { kind: "batch", selected: [] } });
    expect(await screen.findByText("2 items match")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("todo");
    await user.click(screen.getByRole("button", { name: "Start 2 in Factory" }));

    await waitFor(() =>
      expect(enqueue).toHaveBeenCalledWith(
        "warpforge",
        ["b-1", "b-2"],
        expect.objectContaining({ deliver: true, workflow: "review-loop" }),
      ),
    );
    expect(daemon.request).toHaveBeenCalledWith(
      "backlog.list",
      expect.objectContaining({ status: "todo" }),
    );
  });
});
