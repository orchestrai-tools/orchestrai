import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  closeTask: vi.fn().mockResolvedValue(undefined),
  closeProject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./browser-client", () => ({ browser: native }));
import { agentTabId, onAgentTab, resetAllAgentTabs, showAgentTab } from "./browser-agent-tabs";

beforeEach(() => {
  vi.clearAllMocks();
  resetAllAgentTabs();
});

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}

describe("browser tabs", () => {
  it("brings back the tabs opened for one task", async () => {
    installStorage();
    const { readBrowserSession, writeBrowserSession } = await import("./browser-session");
    writeBrowserSession("demo-live", {
      active: "task-demo-live-1",
      tabs: ["task-demo-live", "task-demo-live-1"],
      urls: { "task-demo-live": "", "task-demo-live-1": "http://localhost:4000" },
    });
    expect(readBrowserSession("demo-live")).toEqual({
      active: "task-demo-live-1",
      tabs: ["task-demo-live", "task-demo-live-1"],
      urls: { "task-demo-live": "", "task-demo-live-1": "http://localhost:4000" },
    });
    expect(readBrowserSession("other")).toBeNull();
  });

  it("drops the tabs when the task is removed", async () => {
    installStorage();
    const { clearBrowserSession, readBrowserSession, writeBrowserSession } =
      await import("./browser-session");
    writeBrowserSession("demo-live", {
      active: "task-demo-live",
      tabs: ["task-demo-live"],
      urls: { "task-demo-live": "http://localhost:4000" },
    });
    clearBrowserSession("demo-live");
    expect(readBrowserSession("demo-live")).toBeNull();
    expect(native.closeTask).toHaveBeenCalledWith("demo-live");
  });

  it("numbers a new tab past the ones already open", async () => {
    const { browserTabSeq } = await import("./browser-session");
    expect(browserTabSeq("demo-live", ["task-demo-live", "task-demo-live-2"])).toBe(3);
  });
  it("drops stale project agent tabs from a task restored after closing them", async () => {
    installStorage();
    const { readBrowserSession, writeBrowserSession } = await import("./browser-session");
    writeBrowserSession("one", {
      active: "demo:closed",
      tabs: ["task-one", "demo:closed"],
      urls: { "task-one": "", "demo:closed": "http://localhost:4000/" },
    });
    expect(readBrowserSession("one", "demo")).toEqual({
      active: "task-one",
      tabs: ["task-one"],
      urls: { "task-one": "" },
    });
    showAgentTab("demo", { id: "demo:closed", url: "http://localhost:4000/" });
    expect(readBrowserSession("one", "demo")?.tabs).toEqual(["task-one", "demo:closed"]);
  });
  it("removes a project's browser sessions and agent view without touching another project", async () => {
    installStorage();
    const { clearProjectBrowserSessions, readBrowserSession, writeBrowserSession } =
      await import("./browser-session");
    for (const id of ["one", "two", "other"])
      writeBrowserSession(id, {
        active: `task-${id}`,
        tabs: [`task-${id}`],
        urls: { [`task-${id}`]: "" },
      });
    showAgentTab("demo", { id: "demo:agent", url: "http://localhost:4000/" });
    showAgentTab("other", { id: "other:agent", url: "http://localhost:4001/" });
    clearProjectBrowserSessions("demo", ["one", "two"]);
    expect(native.closeTask.mock.calls).toEqual([["one"], ["two"]]);
    expect(native.closeProject).toHaveBeenCalledWith("demo");
    expect(readBrowserSession("one")).toBeNull();
    expect(readBrowserSession("two")).toBeNull();
    expect(readBrowserSession("other")).not.toBeNull();
    expect(agentTabId("other")).toBe("other:agent");
    const adopted = vi.fn();
    const off = onAgentTab("demo", adopted);
    expect(adopted).not.toHaveBeenCalled();
    off();
  });
  it("keeps the shared agent browser open when one task is removed", async () => {
    installStorage();
    const { clearBrowserSession } = await import("./browser-session");
    showAgentTab("demo", { id: "demo:agent", url: "http://localhost:4000/" });
    clearBrowserSession("one");
    expect(native.closeTask).toHaveBeenCalledWith("one");
    expect(native.closeProject).not.toHaveBeenCalled();
    expect(agentTabId("demo")).toBe("demo:agent");
  });
});
