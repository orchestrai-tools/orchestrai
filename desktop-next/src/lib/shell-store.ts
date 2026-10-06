import type { TaskInfo } from "@warpforge/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PageId } from "../model/pages";
import type { BacklogView, InboxFilters } from "./migrate-warpforge";
import { nextPinnedIds } from "./pin-group";
import { repoTarget, type RepoTarget } from "./repo-target";

export type InspectorId = "details" | "changes" | "checks" | "context" | "activity";

export interface ShellState {
  home: boolean;
  /** What Home shows instead of its board: app-wide Settings, reachable with no project open. */
  homePage: "settings" | null;
  project: string | null;
  openProjects: string[];
  pages: Record<string, PageId>;
  taskId: string | null;
  inspector: boolean;
  inspectorPanel: InspectorId;
  /** Opens the inspector on `id`; picking the panel that is already open closes it. */
  selectInspector: (id: InspectorId) => void;
  terminal: boolean;
  /** When set, the drawer attaches to this session instead of starting a new one. */
  terminalId: string | null;
  focus: boolean;
  sidebar: boolean;
  palette: boolean;
  newTask: boolean;
  adding: boolean;
  push: boolean;
  newBranch: boolean;
  stopFactory: boolean;
  deleteDone: boolean;
  pinned: string[];
  pinnedLayout: Record<string, { x: number; y: number; w: number; h: number }>;
  homeView: "board" | "list" | "pinned";
  taskTab: "conversation" | "plan" | "steps" | "browser";
  projectNav: "tabs" | "dropdown";
  /** Per project: a task worktree, or null for the checkout. Missing means follow the open task. */
  fileContext: Record<string, string | null>;
  /** Remembered for the next new task. */
  newTaskWorktree: boolean;
  backlogByProject: Record<string, BacklogView>;
  inbox: InboxFilters;
  changesPane: Record<string, "worktrees">;
  autoNameTasks: boolean;
  textGenAgentId: string;
  textGenModel: string;
  prAssistantAgentId: string;
  prAssistantModelByAgent: Record<string, string>;
  lspEnabled: boolean;
  openHome: () => void;
  openHomeSettings: () => void;
  openProject: (name: string) => void;
  closeProject: (name: string) => void;
  /** Close the project and drop the pages and filters saved for it. */
  releaseProject: (name: string) => void;
  setPage: (page: PageId) => void;
  openTask: (taskId: string, project: string) => void;
  openTerminal: (id: string) => void;
  toggle: (
    key:
      | "inspector"
      | "terminal"
      | "focus"
      | "sidebar"
      | "palette"
      | "newTask"
      | "adding"
      | "push"
      | "newBranch"
      | "stopFactory"
      | "deleteDone",
  ) => void;
  setProjectNav: (mode: "tabs" | "dropdown") => void;
  togglePin: (taskId: string, tasks?: TaskInfo[]) => void;
  setPinnedLayout: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
  setHomeView: (view: "board" | "list" | "pinned") => void;
  setTaskTab: (tab: ShellState["taskTab"]) => void;
  setFileContext: (taskId: string | null) => void;
  setNewTaskWorktree: (value: boolean) => void;
  setBacklogView: (project: string, view: BacklogView) => void;
  setInbox: (inbox: InboxFilters) => void;
  setAutoNameTasks: (value: boolean) => void;
  setLspEnabled: (value: boolean) => void;
  setTextGen: (agentId: string, model: string) => void;
  setPrAssistantAgent: (agentId: string) => void;
  setPrAssistantModel: (agentId: string, model: string) => void;
  paletteMode: "actions" | "files";
  fileJump: { path: string; line: number } | null;
  openPalette: (mode: "actions" | "files") => void;
  setFileJump: (jump: { path: string; line: number } | null) => void;
}

export const useShell = create<ShellState>()(
  persist(
    (set, get) => ({
      home: true,
      homePage: null,
      project: null,
      openProjects: [],
      pages: {},
      taskId: null,
      inspector: false,
      inspectorPanel: "details",
      selectInspector: (id) => {
        const { inspector, inspectorPanel } = get();
        set(
          inspector && inspectorPanel === id
            ? { inspector: false }
            : { inspector: true, inspectorPanel: id },
        );
      },
      terminal: false,
      terminalId: null,
      focus: false,
      sidebar: true,
      palette: false,
      paletteMode: "actions",
      fileJump: null,
      newTask: false,
      adding: false,
      push: false,
      newBranch: false,
      stopFactory: false,
      deleteDone: false,
      pinned: [],
      pinnedLayout: {},
      homeView: "board",
      taskTab: "conversation",
      projectNav: "tabs",
      fileContext: {},
      newTaskWorktree: false,
      backlogByProject: {},
      inbox: { assignedToMe: false, state: "open", search: "" },
      changesPane: {},
      autoNameTasks: true,
      textGenAgentId: "",
      textGenModel: "",
      prAssistantAgentId: "",
      prAssistantModelByAgent: {},
      lspEnabled: true,
      openHome: () => set({ home: true, homePage: null }),
      openHomeSettings: () => set({ home: true, homePage: "settings" }),
      openProject: (name) => {
        const open = get().openProjects.includes(name)
          ? get().openProjects
          : [...get().openProjects, name];
        set({ home: false, homePage: null, project: name, openProjects: open, taskId: null });
      },
      closeProject: (name) => {
        const current = get();
        const open = current.openProjects.filter((item) => item !== name);
        const leaving = current.project === name;
        const project = leaving ? (open.at(-1) ?? null) : current.project;
        set({
          openProjects: open,
          project,
          home: current.home || project == null,
          taskId: leaving ? null : current.taskId,
        });
      },
      releaseProject: (name) => {
        const current = get();
        const pages = { ...current.pages };
        const fileContext = { ...current.fileContext };
        const backlogByProject = { ...current.backlogByProject };
        const changesPane = { ...current.changesPane };
        delete pages[name];
        delete fileContext[name];
        delete backlogByProject[name];
        delete changesPane[name];
        const leaving = current.project === name;
        set({
          pages,
          fileContext,
          backlogByProject,
          changesPane,
          ...(leaving ? { terminal: false, terminalId: null } : {}),
        });
        get().closeProject(name);
      },
      setPage: (page) => {
        const project = get().project;
        if (!project) return;
        set({ pages: { ...get().pages, [project]: page } });
      },
      openTask: (taskId, project) => {
        const open = get().openProjects.includes(project)
          ? get().openProjects
          : [...get().openProjects, project];
        set({
          home: false,
          project,
          openProjects: open,
          taskId,
          pages: { ...get().pages, [project]: "task" },
          fileContext: { ...get().fileContext, [project]: taskId },
        });
      },
      openTerminal: (id) => set({ terminal: true, terminalId: id }),
      toggle: (key) => {
        if (key === "terminal") {
          const open = !get().terminal;
          set({ terminal: open, terminalId: open ? null : get().terminalId });
          return;
        }
        set({ [key]: !get()[key] });
      },
      setProjectNav: (projectNav) => set({ projectNav }),
      togglePin: (taskId, tasks = []) => {
        const current = get();
        const pinned = nextPinnedIds(tasks, current.pinned, taskId);
        const pinnedLayout = { ...current.pinnedLayout };
        for (const id of current.pinned) {
          if (!pinned.includes(id)) delete pinnedLayout[id];
        }
        const y = Object.values(pinnedLayout).reduce(
          (max, tile) => Math.max(max, tile.y + tile.h),
          0,
        );
        for (const id of pinned) {
          if (!current.pinned.includes(id)) pinnedLayout[id] = { x: 0, y, w: 2, h: 2 };
        }
        set({ pinned, pinnedLayout });
      },
      setPinnedLayout: (id, layout) =>
        set({ pinnedLayout: { ...get().pinnedLayout, [id]: layout } }),
      setHomeView: (homeView) => set({ homeView }),
      setTaskTab: (taskTab) => set({ taskTab }),
      setFileContext: (taskId) => {
        const project = get().project;
        if (!project) return;
        set({ fileContext: { ...get().fileContext, [project]: taskId } });
      },
      setNewTaskWorktree: (newTaskWorktree) => set({ newTaskWorktree }),
      setBacklogView: (project, view) =>
        set({ backlogByProject: { ...get().backlogByProject, [project]: view } }),
      setInbox: (inbox) => set({ inbox }),
      setAutoNameTasks: (autoNameTasks) => set({ autoNameTasks }),
      setLspEnabled: (lspEnabled) => set({ lspEnabled }),
      setTextGen: (textGenAgentId, textGenModel) =>
        set({ textGenAgentId, textGenModel: textGenAgentId ? textGenModel : "" }),
      setPrAssistantAgent: (prAssistantAgentId) => set({ prAssistantAgentId }),
      setPrAssistantModel: (agentId, model) =>
        set({ prAssistantModelByAgent: { ...get().prAssistantModelByAgent, [agentId]: model } }),
      openPalette: (paletteMode) => set({ palette: true, paletteMode }),
      setFileJump: (fileJump) => {
        const project = get().project;
        if (!fileJump || !project) {
          set({ fileJump });
          return;
        }
        set({ fileJump, home: false, pages: { ...get().pages, [project]: "files" } });
      },
    }),
    {
      name: "orc-shell",
      version: 2,
      partialize: persistedShell,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<ShellState>;
        return {
          ...state,
          pinnedLayout: state.pinnedLayout ?? {},
          homeView: state.homeView ?? "board",
          taskTab: state.taskTab ?? "conversation",
          fileContext: state.fileContext ?? {},
          newTaskWorktree: state.newTaskWorktree ?? false,
          backlogByProject: state.backlogByProject ?? {},
          inbox: state.inbox ?? { assignedToMe: false, state: "open", search: "" },
          changesPane: state.changesPane ?? {},
          autoNameTasks: state.autoNameTasks ?? true,
          lspEnabled: state.lspEnabled ?? true,
          inspectorPanel: state.inspectorPanel ?? "details",
          paletteMode: "actions",
          fileJump: null,
          prAssistantModelByAgent: state.prAssistantModelByAgent ?? {},
          push: false,
          newBranch: false,
          stopFactory: false,
          deleteDone: false,
          terminalId: null,
        } as ShellState;
      },
    },
  ),
);

/** What a restart should reopen. A typed search and an open dialog are for this visit. */
export function persistedShell(state: ShellState): ShellState {
  return {
    ...state,
    adding: false,
    backlogByProject: Object.fromEntries(
      Object.entries(state.backlogByProject).map(([project, view]) => [
        project,
        { ...view, search: "" },
      ]),
    ),
    deleteDone: false,
    fileJump: null,
    homePage: null,
    inbox: { ...state.inbox, search: "" },
    newBranch: false,
    newTask: false,
    palette: false,
    push: false,
    stopFactory: false,
  };
}

export function currentPage(state: ShellState): PageId {
  if (!state.project) return "board";
  return state.pages[state.project] ?? "board";
}

/** The task or Home that Control-Tab and Command-Shift-bracket should open. Null is Home. */
export function cycleOpenProject(state: ShellState, direction: 1 | -1): string | null {
  const slots: Array<string | null> = [null, ...state.openProjects];
  const current = state.home || !state.project ? 0 : Math.max(0, slots.indexOf(state.project));
  const next = (current + direction + slots.length) % slots.length;
  return slots[next] ?? null;
}
export function fileTaskId(state: ShellState, tasks: { id: string; project: string }[]): string {
  if (!state.project) return "";
  if (Object.hasOwn(state.fileContext, state.project)) {
    const selected = state.fileContext[state.project];
    return tasks.find((task) => task.id === selected && task.project === state.project)?.id ?? "";
  }
  const open = tasks.find((task) => task.id === state.taskId && task.project === state.project);
  return open?.id ?? "";
}

/** The checkout Changes and Files act on: the open task's worktree, else the project's own checkout. */
export function fileRepoTarget(
  state: ShellState,
  tasks: { id: string; project: string }[],
): RepoTarget | null {
  if (!state.project) return null;
  return repoTarget(fileTaskId(state, tasks), state.project);
}
