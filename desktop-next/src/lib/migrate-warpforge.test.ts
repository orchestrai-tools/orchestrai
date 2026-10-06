import { describe, expect, it } from "vitest";
import { readWarpforgePrefs, upgradeWarpforgeStore } from "./migrate-warpforge";

describe("upgradeWarpforgeStore", () => {
  it("applies the upgrades an older store would get on its way to version 8", () => {
    const state = upgradeWarpforgeStore({
      version: 0,
      state: {
        bodyGlass: false,
        sidebarOpacity: 0.2,
        sidebarWidth: 10,
        projectSurfaceByProject: { app: "factory", docs: "files" },
      },
    });
    expect(state.bodyGlass).toBe(true);
    expect(state.sidebarOpacity).toBe(0.6);
    expect(state.sidebarWidth).toBe(260);
    expect(state.projectSurfaceByProject).toEqual({ docs: "files" });
  });

  it("leaves a version 8 choice alone", () => {
    const state = upgradeWarpforgeStore({
      version: 8,
      state: { bodyGlass: false, projectSurfaceByProject: { app: "files" } },
    });
    expect(state.bodyGlass).toBe(false);
    expect(state.projectSurfaceByProject).toEqual({ app: "files" });
  });
});

describe("readWarpforgePrefs", () => {
  it("maps each old project surface onto the page that replaced it", () => {
    const prefs = readWarpforgePrefs({
      selectedProjectId: "app",
      projectSurfaceByProject: { app: "terminal", docs: "worktrees", code: "pulls" },
      autoNameTasks: false,
      lspEnabled: false,
    });
    expect(prefs.pages).toEqual({ app: "board", docs: "changes", code: "github" });
    expect(prefs.changesPane).toEqual({ docs: "worktrees" });
    expect(prefs.terminal).toBe(true);
    expect(prefs.autoNameTasks).toBe(false);
    expect(prefs.lspEnabled).toBe(false);
  });

  it("keeps the backlog query and the inbox filters", () => {
    const prefs = readWarpforgePrefs({
      backlogParamsByProject: {
        app: { search: "auth", status: "open", sortBy: "priority", sortDesc: false },
      },
      inboxFilters: { assignedToMe: true, state: "all", search: "bug" },
    });
    expect(prefs.backlogByProject?.app).toEqual({
      search: "auth",
      status: "open",
      sortBy: "priority",
      sortDesc: false,
      priority: "",
      source: "",
      assignee: "",
    });
    expect(prefs.inbox).toEqual({ assignedToMe: true, state: "all", search: "bug" });
  });

  it("keeps the pull request assistant's agent and model", () => {
    const prefs = readWarpforgePrefs({
      prAssistantAgentId: "claude",
      prAssistantModelByAgent: { claude: "opus", broken: 1 },
    });
    expect(prefs.prAssistantAgentId).toBe("claude");
    expect(prefs.prAssistantModelByAgent).toEqual({ claude: "opus" });
  });
});
