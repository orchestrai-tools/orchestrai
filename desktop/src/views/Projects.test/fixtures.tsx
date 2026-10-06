import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";

import { daemon } from "../../daemon";
import { disposeTerminalWorkspace } from "../../lib/terminalWorkspace";
import type { ProjectInfo, Snapshot, TaskInfo, TerminalInfo } from "../../protocol";
import { useUi } from "../../store/ui";
import Projects from "../Projects";

export interface MockXterm {
  element: HTMLElement;
  open: ReturnType<typeof vi.fn>;
}

export const warpforgeProject: ProjectInfo = {
  agentTemplates: {},
  declaredServices: [],
  name: "warpforge",
  path: "/workspace/warpforge",
  portRange: [4000, 4099],
};

export const snapshot: Snapshot = {
  portforwards: [],
  projects: [warpforgeProject],
  services: [],
  tasks: [],
  terminals: [],
};

export const projectTest = { snapshot };

export function terminalInfo(id: string, project: string): TerminalInfo {
  return {
    cols: 80,
    command: "sh",
    id,
    project,
    rows: 24,
    startedAt: 1,
  };
}

export function renderProjects(
  projectSnapshot = projectTest.snapshot,
  onNewTask = vi.fn<(project?: string, prompt?: string) => void>(),
) {
  // The backlog reads its tracker links through TanStack Query; a fresh client
  // per render keeps tests from sharing cached daemon reads.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Projects
        snapshot={projectSnapshot}
        onOpenTask={vi.fn<(id: string) => void>()}
        onNewTask={onNewTask}
        onAddProject={vi.fn<() => void>()}
      />
    </QueryClientProvider>,
  );
}

/** Radix tabs select on mousedown, which `fireEvent.click` does not send. */
export async function openSurface(label: RegExp) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("tab", { name: label }));
}

export function taskInfo(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    agent: "codex",
    blockedReason: null,
    createdAt: 100,
    filesChanged: 0,
    id: "task-1",
    project: "warpforge",
    prompt: "Task prompt",
    status: "running",
    tags: [],
    title: "Task",
    updatedAt: 110,
    ...overrides,
  };
}

beforeEach(() => {
  projectTest.snapshot = snapshot;
  localStorage.clear();
  useUi.setState({ projectSurfaceByProject: {}, selectedProjectId: null });

  vi.spyOn(daemon, "subscribeEvents").mockReturnValue(() => {});
  vi.spyOn(daemon, "subscribe").mockReturnValue(() => {});
  vi.spyOn(daemon, "subscribeTerminalData").mockReturnValue(() => {});
  vi.spyOn(daemon, "clearTerminalBuffer").mockImplementation(() => {});
  vi.spyOn(daemon, "resizeTerminal").mockImplementation(() => {});
  vi.spyOn(daemon, "sendTerminalInput").mockImplementation(() => {});
  vi.spyOn(daemon, "removeProject").mockResolvedValue();
  vi.spyOn(daemon, "setProjectPortRange").mockResolvedValue();
  vi.spyOn(daemon, "importExternalWorkItems").mockResolvedValue({ items: [], synced: [] });
  vi.spyOn(daemon, "syncExternalWorkItems").mockResolvedValue([]);
  vi.spyOn(daemon, "listBacklog").mockImplementation(async (input) => ({
    items: input.pageSize === 1 ? [] : [],
    page: 0,
    pageSize: input.pageSize,
    total: 0,
    hasNextPage: false,
  }));
  vi.spyOn(daemon, "getState").mockImplementation(() => ({
    connection: "connected",
    connectionError: null,
    pendingAgentSetup: null,
    portforwardLogs: {},
    serviceLogs: {},
    sessionUpdates: {},
    snapshot: projectTest.snapshot,
  }));
});

afterEach(() => {
  disposeTerminalWorkspace("warpforge");
  disposeTerminalWorkspace("alpha");
  disposeTerminalWorkspace("beta");
  vi.restoreAllMocks();
});
