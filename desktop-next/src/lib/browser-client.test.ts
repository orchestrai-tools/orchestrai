import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("closing native browser views", () => {
  it.each(["tab", "task", "project"] as const)(
    "waits for an opening %s view before closing it",
    async (kind) => {
      let finish: () => void = () => {};
      native.invoke.mockImplementation((command: string) =>
        command === "browser_open"
          ? new Promise<void>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(),
      );
      const { browser } = await import("./browser-client");
      const id = kind === "project" ? "demo:agent" : "task-one-1";
      const opening = browser.open(id, "http://localhost:4000/", {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const closing =
        kind === "tab"
          ? browser.close(id)
          : kind === "task"
            ? browser.closeTask("one")
            : browser.closeProject("demo");
      await vi.waitFor(() =>
        expect(native.invoke).toHaveBeenCalledWith("browser_open", expect.any(Object)),
      );
      expect(native.invoke.mock.calls.map(([command]) => command)).toEqual(["browser_open"]);
      finish();
      await Promise.all([opening, closing]);
      expect(native.invoke.mock.calls.map(([command]) => command)).toEqual([
        "browser_open",
        kind === "tab"
          ? "browser_close"
          : kind === "task"
            ? "browser_close_task"
            : "browser_close_project",
      ]);
    },
  );

  it("does not wait for another task's opening view", async () => {
    let finish: () => void = () => {};
    native.invoke.mockImplementation((command: string) =>
      command === "browser_open"
        ? new Promise<void>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(),
    );
    const { browser } = await import("./browser-client");
    const opening = browser.open("task-two-1", "http://localhost:4000/", {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith("browser_open", expect.any(Object)),
    );
    await browser.closeTask("one");
    expect(native.invoke).toHaveBeenCalledWith("browser_close_task", { taskId: "one" });
    finish();
    await opening;
  });
});
