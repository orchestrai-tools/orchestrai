/**
 * Runs the daemon's browser requests — an agent's `browser_*` tools — in the
 * project's active tab. The daemon decides which origins are allowed; the tab
 * commands check the page against that list natively before acting.
 */
import { serveClientRequests, type ClientRequestChannel } from "@/daemon/clientRequests";
import { IS_TAURI } from "@/lib/platform";

import { BROWSER_CAPABILITY, type BrowserAction, type ClientRequestBody } from "../../../protocol";
import {
  browser,
  NO_TAB,
  onBrowserState,
  onBrowserTitle,
  type BrowserStateEvent,
} from "./browserClient";
import { agentTab, recordTabPage } from "./browserSession";

/** Where a tab an agent opens sits while no pane shows it; a pane that mounts
 *  later moves it into place. */
const BACKGROUND_BOUNDS = { x: 0, y: 0, width: 1280, height: 800 };
/** A same-document navigation reports no load at all. */
const START_WAIT_MS = 4_000;
const LOAD_WAIT_MS = 20_000;
const TITLE_WAIT_MS = 1_000;

const NO_PAGE =
  "No page is open in the project's browser. Open one with browser_navigate; list_runtime shows the project's service URLs.";

function isBlank(url: string): boolean {
  return url.length === 0 || url === "about:blank";
}

function isNoTab(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error) === NO_TAB;
}

interface Load {
  url: string;
  title: string;
  loading: boolean;
}

/**
 * Watch one tab's load, listening before it is started: `done` resolves once
 * the page has loaded, or with `loading` when it takes too long.
 */
async function watchLoad(
  tabId: string,
  fallbackUrl: string,
  signal: AbortSignal,
): Promise<{ done: Promise<Load>; stop: () => void }> {
  const state: Load = { url: fallbackUrl, title: "", loading: false };
  let started = false;
  let finish: (load: Load) => void = () => {};
  const done = new Promise<Load>((resolve) => {
    finish = resolve;
  });
  const timers: number[] = [];
  const settle = () => finish({ ...state });
  const offState = await onBrowserState((e: BrowserStateEvent) => {
    if (e.tabId !== tabId) return;
    state.url = e.url;
    state.loading = e.loading;
    if (e.loading) {
      started = true;
    } else if (started) {
      // The title is read once the page settles; give it a moment to land.
      timers.push(window.setTimeout(settle, TITLE_WAIT_MS));
    }
  });
  const offTitle = await onBrowserTitle((e) => {
    if (e.tabId !== tabId || !started || state.loading) return;
    state.title = e.title;
    settle();
  });
  timers.push(
    window.setTimeout(() => {
      if (!started) settle();
    }, START_WAIT_MS),
    window.setTimeout(() => finish({ ...state, loading: true }), LOAD_WAIT_MS),
  );
  signal.addEventListener("abort", settle);
  const stop = () => {
    for (const timer of timers) window.clearTimeout(timer);
    signal.removeEventListener("abort", settle);
    offState();
    offTitle();
  };
  return { done, stop };
}

/** Load `url` in the tab, creating its webview out of sight when it has none. */
async function load(tabId: string, url: string, signal: AbortSignal): Promise<Load> {
  const watch = await watchLoad(tabId, url, signal);
  try {
    try {
      await browser.navigate(tabId, url);
    } catch (error) {
      if (!isNoTab(error)) throw error;
      await browser.open(tabId, url, BACKGROUND_BOUNDS, false, true);
    }
    const result = await watch.done;
    recordTabPage(tabId, { url: result.url, ...(result.title ? { title: result.title } : {}) });
    return result;
  } finally {
    watch.stop();
  }
}

/** Run a page action; a remembered tab whose view is gone after a restart is
 *  reopened out of sight first. */
async function inPage(
  tab: { id: string; url: string },
  run: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const first = await run().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (first.ok) return first.value;
  if (!isNoTab(first.error)) throw first.error;
  if (isBlank(tab.url)) throw new Error(NO_PAGE);
  await load(tab.id, tab.url, signal);
  return run();
}

/**
 * Do what one browser request asks, in the project's active tab.
 * @param body the daemon's request
 * @param signal aborted when the daemon stops waiting
 * @returns the result the daemon hands to the agent
 */
export async function runBrowserRequest(
  body: ClientRequestBody,
  signal: AbortSignal,
): Promise<unknown> {
  const { action, allowed_origins: allowed, project } = body;
  if (action.action === "navigate") {
    const tab = agentTab(project, true);
    if (!tab) throw new Error(NO_PAGE);
    return load(tab.id, action.url, signal);
  }
  const tab = agentTab(project);
  if (!tab) throw new Error(NO_PAGE);
  if (action.action === "screenshot") {
    return inPage(tab, () => browser.agentScreenshot(tab.id, allowed), signal);
  }
  const call: Exclude<BrowserAction, { action: "navigate" | "screenshot" }> = action;
  return inPage(tab, () => browser.agentCall(tab.id, call, allowed), signal);
}

/**
 * Serve the agents' browser tools from this app for as long as it runs, and
 * keep remembered tabs following pages that change while no pane shows them.
 * @param channel the daemon client
 */
export function installBrowserAgent(channel: ClientRequestChannel): void {
  if (!IS_TAURI) return;
  void onBrowserState(({ tabId, url }) => recordTabPage(tabId, { url }));
  void onBrowserTitle(({ tabId, title }) => {
    if (title) recordTabPage(tabId, { title });
  });
  serveClientRequests(channel, BROWSER_CAPABILITY, runBrowserRequest);
}
