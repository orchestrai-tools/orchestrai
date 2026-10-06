import { describe, expect, it } from "vitest";

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
  });

  it("numbers a new tab past the ones already open", async () => {
    const { browserTabSeq } = await import("./browser-session");
    expect(browserTabSeq("demo-live", ["task-demo-live", "task-demo-live-2"])).toBe(3);
  });
});
