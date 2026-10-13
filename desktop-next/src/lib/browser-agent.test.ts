import type { ClientRequestChannel } from "@warpforge/daemon/clientRequests";
import type { ClientRequestBody } from "@warpforge/protocol";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Set<(event: { tabId: string; url: string; loading: boolean }) => void>(),
  browser: { navigate: vi.fn(), open: vi.fn(), agentCall: vi.fn(), agentScreenshot: vi.fn() },
  stop: vi.fn(),
  serve: vi.fn(),
}));
vi.mock("@warpforge/daemon/clientRequests", () => ({ serveClientRequests: mocks.serve }));
vi.mock("./browser-client", () => ({
  IS_TAURI: true,
  NO_TAB: "no such browser tab",
  browser: mocks.browser,
  onBrowserState: (handler: (event: { tabId: string; url: string; loading: boolean }) => void) => {
    mocks.handlers.add(handler);
    return Promise.resolve(() => mocks.handlers.delete(handler));
  },
  onBrowserTitle: () => Promise.resolve(() => {}),
}));
import { installBrowserAgent, resetAgentTabs, runBrowserRequest } from "./browser-agent";
import { clearAgentTabs, forgetAgentTab, onAgentTab, recordTabPage } from "./browser-agent-tabs";

const url = "http://localhost:4901/";
const request = (action: ClientRequestBody["action"]): ClientRequestBody => ({
  kind: "browser",
  project: "demo",
  action,
  allowed_origins: ["http://localhost:4901"],
});
const run = (action: ClientRequestBody["action"]) =>
  runBrowserRequest(request(action), new AbortController().signal);
function loaded(tabId: string) {
  for (const handler of mocks.handlers) {
    handler({ tabId, url, loading: true });
    handler({ tabId, url, loading: false });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  resetAgentTabs();
  clearAgentTabs("demo");
  mocks.handlers.clear();
  mocks.serve.mockReturnValue(mocks.stop);
  mocks.browser.navigate.mockRejectedValue("no such browser tab");
  mocks.browser.open.mockImplementation(async (id: string) => loaded(id));
  mocks.browser.agentScreenshot.mockResolvedValue({ pngBase64: "shot" });
  mocks.browser.agentCall.mockResolvedValue({
    url,
    origin: "http://localhost:4901",
    title: "Todo",
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("native agent browser parity", () => {
  it("registers the request handler and unregisters it on shutdown", async () => {
    const channel = {} as ClientRequestChannel;
    const stop = installBrowserAgent(channel);
    expect(mocks.serve).toHaveBeenCalledWith(channel, "browser", runBrowserRequest);
    stop();
    await Promise.resolve();
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.handlers.size).toBe(0);
  });
  it("keeps actions on the agent's tab and passes origin restrictions through", async () => {
    const shown: string[] = [];
    const off = onAgentTab("demo", (tab) => shown.push(tab.id));
    await run({ action: "navigate", url });
    const id = shown[0];
    expect(id).toBeDefined();
    expect(mocks.browser.open).toHaveBeenCalledWith(id, url, expect.any(Object), false, true);
    await run({ action: "click", ref: "e1" });
    expect(mocks.browser.agentCall).toHaveBeenLastCalledWith(id, { action: "click", ref: "e1" }, [
      "http://localhost:4901",
    ]);
    await run({ action: "screenshot" });
    expect(mocks.browser.agentScreenshot).toHaveBeenCalledWith(id, ["http://localhost:4901"]);
    off();
  });
  it("adopts the current background page when a task's Browser pane opens later", async () => {
    await run({ action: "navigate", url });
    const id = mocks.browser.open.mock.calls[0][0] as string;
    recordTabPage(id, { url: url + "done", title: "Finished" });
    const received = vi.fn();
    const off = onAgentTab("demo", received);
    expect(received).toHaveBeenCalledWith({ id, url: url + "done", title: "Finished" });
    off();
  });
  it("refuses actions before navigation, and explains a closed tab", async () => {
    await expect(run({ action: "snapshot" })).rejects.toThrow("no browser tab yet");
    await run({ action: "navigate", url });
    mocks.browser.agentCall.mockRejectedValue("no such browser tab");
    await expect(run({ action: "snapshot" })).rejects.toThrow("browser tab was closed");
    await expect(run({ action: "snapshot" })).rejects.toThrow("no browser tab yet");
  });
  it("keeps a user-closed agent tab closed until the next explicit navigation", async () => {
    await run({ action: "navigate", url });
    const closed = mocks.browser.open.mock.calls[0][0] as string;
    forgetAgentTab(closed);
    const adopted = vi.fn();
    const off = onAgentTab("demo", adopted);
    expect(adopted).not.toHaveBeenCalled();
    await expect(run({ action: "snapshot" })).rejects.toThrow("no browser tab yet");
    await run({ action: "navigate", url });
    expect(mocks.browser.open.mock.calls[1][0]).not.toBe(closed);
    off();
  });
  it("does not start an action after it was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runBrowserRequest(request({ action: "navigate", url }), controller.signal),
    ).rejects.toThrow("cancelled");
    expect(mocks.browser.navigate).not.toHaveBeenCalled();
    expect(mocks.browser.open).not.toHaveBeenCalled();
    expect(mocks.browser.agentCall).not.toHaveBeenCalled();
  });
  it("stops navigation follow-up work after cancellation during the native open", async () => {
    const controller = new AbortController();
    mocks.browser.navigate.mockImplementation(async () => {
      controller.abort();
      throw new Error("no such browser tab");
    });
    await expect(
      runBrowserRequest(request({ action: "navigate", url }), controller.signal),
    ).rejects.toThrow("cancelled");
    expect(mocks.browser.open).not.toHaveBeenCalled();
    expect(mocks.browser.agentCall).not.toHaveBeenCalled();
    expect(mocks.handlers.size).toBe(0);
  });
  it("does not inspect the page when a loading request was cancelled", async () => {
    const controller = new AbortController();
    mocks.browser.navigate.mockImplementation(async (id: string) => {
      for (const handler of mocks.handlers) handler({ tabId: id, url, loading: true });
    });
    const running = runBrowserRequest(request({ action: "navigate", url }), controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(running).rejects.toThrow("cancelled");
    expect(mocks.browser.agentCall).not.toHaveBeenCalled();
    expect(mocks.handlers.size).toBe(0);
  });

  it("does not resurrect a project browser removed while its native view opened", async () => {
    let finish: () => void = () => {};
    mocks.browser.open.mockImplementation(
      (id: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            loaded(id);
            resolve();
          };
        }),
    );
    const navigating = run({ action: "navigate", url });
    await vi.waitFor(() => expect(mocks.browser.open).toHaveBeenCalled());
    clearAgentTabs("demo");
    finish();
    await expect(navigating).rejects.toThrow("closed during navigation");
    const adopted = vi.fn();
    const off = onAgentTab("demo", adopted);
    expect(adopted).not.toHaveBeenCalled();
    expect(mocks.browser.agentCall).not.toHaveBeenCalled();
    off();
  });
});
