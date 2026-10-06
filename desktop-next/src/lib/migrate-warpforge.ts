import type { PageId } from "../model/pages";

const SURFACE_PAGE: Record<string, PageId> = {
  backlog: "backlog",
  pulls: "github",
  files: "files",
  runtime: "services",
  terminal: "board",
  worktrees: "changes",
};

export interface InboxFilters {
  assignedToMe: boolean;
  state: "open" | "all";
  search: string;
}

export interface BacklogView {
  search: string;
  status: string;
  sortBy: string;
  sortDesc: boolean;
  priority: string;
  source: string;
  assignee: string;
}

export interface WarpforgePrefs {
  pages: Record<string, PageId>;
  changesPane: Record<string, "worktrees">;
  terminal: boolean;
  backlogByProject: Record<string, BacklogView>;
  inbox: InboxFilters;
  autoNameTasks: boolean;
  textGenAgentId: string;
  textGenModel: string;
  prAssistantAgentId: string;
  prAssistantModelByAgent: Record<string, string>;
  lspEnabled: boolean;
}

const OPACITY_MIN = 0.6;
const WIDTH_MIN = 260;
const WIDTH_MAX = 480;

/**
 * Bring an old `wf-ui` store up to the version 8 shape before this shell reads it.
 * The old app does the same upgrades the next time it opens.
 */
export function upgradeWarpforgeStore(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const parsed = raw as { state?: unknown; version?: unknown };
  const state: Record<string, unknown> =
    parsed.state && typeof parsed.state === "object"
      ? { ...(parsed.state as Record<string, unknown>) }
      : {};
  const version = typeof parsed.version === "number" ? parsed.version : 0;

  if (
    version === 0 &&
    typeof state.sidebarWidth === "number" &&
    Number.isFinite(state.sidebarWidth)
  ) {
    state.sidebarWidth = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(state.sidebarWidth)));
  }
  if (version < 2 && !("pinnedLayout" in state)) state.pinnedLayout = {};
  if (version < 7) state.bodyGlass = true;
  if (
    version < 4 &&
    typeof state.sidebarOpacity === "number" &&
    state.sidebarOpacity < OPACITY_MIN
  ) {
    state.sidebarOpacity = OPACITY_MIN;
  }
  if (
    version < 8 &&
    state.projectSurfaceByProject &&
    typeof state.projectSurfaceByProject === "object"
  ) {
    const surfaces = state.projectSurfaceByProject as Record<string, unknown>;
    state.projectSurfaceByProject = Object.fromEntries(
      Object.entries(surfaces).filter(([, surface]) => surface !== "factory"),
    );
  }
  return state;
}

/** The old app's remembered pages and filters, ready for this shell. */
export function readWarpforgePrefs(state: Record<string, unknown>): Partial<WarpforgePrefs> {
  const prefs: Partial<WarpforgePrefs> = {};
  const surfaces = state.projectSurfaceByProject;
  if (surfaces && typeof surfaces === "object") {
    const pages: Record<string, PageId> = {};
    const changesPane: Record<string, "worktrees"> = {};
    for (const [project, surface] of Object.entries(surfaces as Record<string, unknown>)) {
      if (typeof surface !== "string") continue;
      const page = SURFACE_PAGE[surface];
      if (!page) continue;
      pages[project] = page;
      if (surface === "worktrees") changesPane[project] = "worktrees";
      if (surface === "terminal" && state.selectedProjectId === project) prefs.terminal = true;
    }
    if (Object.keys(pages).length > 0) prefs.pages = pages;
    if (Object.keys(changesPane).length > 0) prefs.changesPane = changesPane;
  }

  const backlog = state.backlogParamsByProject;
  if (backlog && typeof backlog === "object") {
    const views: Record<string, BacklogView> = {};
    for (const [project, params] of Object.entries(backlog as Record<string, unknown>)) {
      if (!params || typeof params !== "object") continue;
      const row = params as Record<string, unknown>;
      views[project] = {
        search: typeof row.search === "string" ? row.search : "",
        status: typeof row.status === "string" ? row.status : "",
        sortBy: typeof row.sortBy === "string" ? row.sortBy : "updated",
        sortDesc: row.sortDesc !== false,
        priority: typeof row.priority === "string" ? row.priority : "",
        source: typeof row.source === "string" ? row.source : "",
        assignee: typeof row.assignee === "string" ? row.assignee : "",
      };
    }
    if (Object.keys(views).length > 0) prefs.backlogByProject = views;
  }

  const inbox = state.inboxFilters;
  if (inbox && typeof inbox === "object") {
    const row = inbox as Record<string, unknown>;
    prefs.inbox = {
      assignedToMe: row.assignedToMe === true,
      state: row.state === "all" ? "all" : "open",
      search: typeof row.search === "string" ? row.search : "",
    };
  }

  if (typeof state.autoNameTasks === "boolean") prefs.autoNameTasks = state.autoNameTasks;
  if (typeof state.textGenAgentId === "string") prefs.textGenAgentId = state.textGenAgentId;
  if (typeof state.textGenModel === "string") prefs.textGenModel = state.textGenModel;
  if (typeof state.prAssistantAgentId === "string")
    prefs.prAssistantAgentId = state.prAssistantAgentId;
  if (state.prAssistantModelByAgent && typeof state.prAssistantModelByAgent === "object") {
    const models: Record<string, string> = {};
    for (const [agent, model] of Object.entries(
      state.prAssistantModelByAgent as Record<string, unknown>,
    )) {
      if (typeof model === "string") models[agent] = model;
    }
    if (Object.keys(models).length > 0) prefs.prAssistantModelByAgent = models;
  }
  if (typeof state.lspEnabled === "boolean") prefs.lspEnabled = state.lspEnabled;
  return prefs;
}
