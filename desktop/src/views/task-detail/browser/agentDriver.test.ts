import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientRequestBody } from "../../../protocol";
import type { BrowserStateEvent, BrowserTitleEvent } from "./browserClient";

const stateHandlers = new Set<(e: BrowserStateEvent) => void>();
const titleHandlers = new Set<(e: BrowserTitleEvent) => void>();
const browser = {
  navigate: vi.fn<(tabId: string, url: string) => Promise<void>>(),
  open: vi.fn<(...args: unknown[]) => Promise<void>>(),
  agentCall: vi.fn<(tabId: string, call: unknown, allowed: string[]) => Promise<unknown>>(),
  agentScreenshot: vi.fn<(tabId: string, allowed: string[]) => Promise<unknown>>(),
};

vi.mock("./browserClient", () => ({
  NO_TAB: "no such browser tab",
  browser,
  onBrowserState: (fn: (e: BrowserStateEvent) => void) => {
    stateHandlers.add(fn);
    return Promise.resolve(() => stateHandlers.delete(fn));
  },
  onBrowserTitle: (fn: (e: BrowserTitleEvent) => void) => {
    titleHandlers.add(fn);
    return Promise.resolve(() => titleHandlers.delete(fn));
  },
}));

const { runBrowserRequest } = await import("./agentDriver");
const { agentTab, clearBrowserSession, saveBrowserSession } = await import("./browserSession");

function request(action: ClientRequestBody["action"]): ClientRequestBody {
  return { kind: "browser", project: "p", action, allowed_origins: ["http://localhost:4001"] };
}

/** A page load as the native view reports it: started, finished, then titled. */
function loadPage(tabId: string, url: string, title: string) {
  for (const fn of [...stateHandlers]) fn({ tabId, url, loading: true });
  for (const fn of [...stateHandlers]) fn({ tabId, url, loading: false });
  for (const fn of [...titleHandlers]) fn({ tabId, url, title });
}

beforeEach(() => {
  clearBrowserSession("p");
  for (const mock of Object.values(browser)) mock.mockReset();
});

describe("runBrowserRequest", () => {
  it("navigating with no tab opens one out of sight and waits for the page", async () => {
    browser.navigate.mockRejectedValue("no such browser tab");
    browser.open.mockImplementation(async (...args) => {
      queueMicrotask(() => loadPage(args[0] as string, "http://localhost:4001/", "Home"));
    });

    const result = await runBrowserRequest(
      request({ action: "navigate", url: "http://localhost:4001/" }),
      new AbortController().signal,
    );

    const tab = agentTab("p");
    expect(tab?.id).toMatch(/^p:/);
    expect(browser.open).toHaveBeenCalledWith(
      tab?.id,
      "http://localhost:4001/",
      expect.objectContaining({ width: 1280 }),
      false,
      true,
    );
    expect(result).toEqual({ url: "http://localhost:4001/", title: "Home", loading: false });
    expect(tab?.url).toBe("http://localhost:4001/");
  });

  it("a page action with no page open says to navigate first", async () => {
    await expect(
      runBrowserRequest(request({ action: "snapshot" }), new AbortController().signal),
    ).rejects.toThrow("browser_navigate");
  });

  it("a remembered tab whose view is gone is reopened, then acted on with the allowed origins", async () => {
    saveBrowserSession("p", {
      tabs: [{ id: "p:1", url: "http://localhost:4001/a" }],
      activeId: "p:1",
    });
    browser.agentCall
      .mockRejectedValueOnce("no such browser tab")
      .mockResolvedValueOnce({ tree: "- button [e1]" });
    browser.navigate.mockRejectedValue("no such browser tab");
    browser.open.mockImplementation(async () => {
      queueMicrotask(() => loadPage("p:1", "http://localhost:4001/a", "A"));
    });

    const result = await runBrowserRequest(
      request({ action: "click", ref: "e1" }),
      new AbortController().signal,
    );

    expect(result).toEqual({ tree: "- button [e1]" });
    expect(browser.agentCall).toHaveBeenLastCalledWith("p:1", { action: "click", ref: "e1" }, [
      "http://localhost:4001",
    ]);
  });

  it("an error from the page reaches the agent unchanged", async () => {
    saveBrowserSession("p", {
      tabs: [{ id: "p:1", url: "http://localhost:4001/" }],
      activeId: "p:1",
    });
    browser.agentScreenshot.mockRejectedValue("browser screenshots are available on macOS only");
    await expect(
      runBrowserRequest(request({ action: "screenshot" }), new AbortController().signal),
    ).rejects.toBe("browser screenshots are available on macOS only");
  });
});
