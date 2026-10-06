import { describe, expect, it } from "vitest";

import type { BacklogView } from "./migrate-warpforge";
import {
  fileTaskId,
  persistedShell,
  useShell,
  type ShellState,
  cycleOpenProject,
} from "./shell-store";

const backlog: BacklogView = {
  search: "columns",
  status: "open",
  sortBy: "updated",
  sortDesc: true,
  priority: "",
  source: "",
  assignee: "",
};

function shell(patch: Partial<ShellState>): ShellState {
  return {
    project: "demo",
    taskId: "open",
    fileContext: {},
    ...patch,
  } as ShellState;
}

describe("fileTaskId", () => {
  const tasks = [
    { id: "open", project: "demo" },
    { id: "wt", project: "demo" },
  ];

  it("follows the open task until a worktree is chosen", () => {
    expect(fileTaskId(shell({}), tasks)).toBe("open");
  });

  it("uses the chosen worktree, or the checkout when that choice is empty", () => {
    expect(fileTaskId(shell({ fileContext: { demo: "wt" } }), tasks)).toBe("wt");
    expect(fileTaskId(shell({ fileContext: { demo: null } }), tasks)).toBe("");
  });

  it("cycles Home and the open projects", () => {
    const open = shell({ home: true, project: null, openProjects: ["a", "b"] });
    expect(cycleOpenProject(open, 1)).toBe("a");
    expect(
      cycleOpenProject(shell({ home: false, project: "b", openProjects: ["a", "b"] }), 1),
    ).toBeNull();
    expect(
      cycleOpenProject(shell({ home: false, project: "a", openProjects: ["a", "b"] }), -1),
    ).toBeNull();
  });
});

describe("persistedShell", () => {
  it("keeps the filters and drops the search and dialogs from this visit", () => {
    const stored = persistedShell(
      shell({
        inbox: { assignedToMe: true, state: "all", search: "columns" },
        backlogByProject: { demo: backlog },
        palette: true,
        newTask: true,
        push: true,
      }),
    );
    expect(stored.inbox).toEqual({ assignedToMe: true, state: "all", search: "" });
    expect(stored.backlogByProject.demo?.search).toBe("");
    expect(stored.backlogByProject.demo?.status).toBe("open");
    expect(stored.palette).toBe(false);
    expect(stored.newTask).toBe(false);
    expect(stored.push).toBe(false);
  });
});

describe("releaseProject", () => {
  it("keeps Home selected when a background project tab is closed", () => {
    useShell.setState({
      home: true,
      project: "demo",
      openProjects: ["demo", "other"],
      taskId: null,
    });
    useShell.getState().closeProject("demo");
    expect(useShell.getState().home).toBe(true);
    expect(useShell.getState().project).toBe("other");
    expect(useShell.getState().openProjects).toEqual(["other"]);
  });

  it("drops the removed project's pages and leaves the next project", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: () => null,
        get length() {
          return values.size;
        },
      },
    });
    useShell.setState({
      home: false,
      project: "demo",
      openProjects: ["demo", "other"],
      pages: { demo: "files", other: "board" },
      taskId: "demo-task",
      fileContext: { demo: "demo-task", other: null },
      backlogByProject: { demo: backlog },
      changesPane: { demo: "worktrees" },
      terminal: true,
      terminalId: "term-1",
    });
    useShell.getState().releaseProject("demo");
    const state = useShell.getState();
    expect(state.project).toBe("other");
    expect(state.taskId).toBeNull();
    expect(state.pages.demo).toBeUndefined();
    expect(state.pages.other).toBe("board");
    expect(state.fileContext.demo).toBeUndefined();
    expect(state.backlogByProject.demo).toBeUndefined();
    expect(state.changesPane.demo).toBeUndefined();
    expect(state.terminal).toBe(false);
    expect(state.terminalId).toBeNull();
  });
});
