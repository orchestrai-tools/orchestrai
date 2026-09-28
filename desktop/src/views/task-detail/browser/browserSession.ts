/**
 * The open tabs, remembered per project across restarts.
 *
 * The native content webviews do not survive a restart, but the login cookies
 * do; persisting the tab list lets the browser reopen the same pages into that
 * still-logged-in session. Scoped per project — unrelated projects never share
 * a browser — and cleared when a project is removed.
 *
 * Tiny data, so localStorage rather than a migration of the IndexedDB session
 * schema; the per-project key is what makes cleanup a single `remove`.
 */
import type { BrowserTab } from "./useBrowserTabs";

const PREFIX = "warpforge.browser.";

export interface PersistedTab {
  id: string;
  url: string;
}

export interface BrowserSession {
  tabs: PersistedTab[];
  activeId: string | null;
}

export interface LiveBrowserSession {
  tabs: BrowserTab[];
  activeId: string | null;
}

/** The tabs as last rendered, for this app run. A remounted pane reuses the
 *  still-open webviews, which report no new title or history, so it takes
 *  those from here rather than from the saved session. */
const live = new Map<string, LiveBrowserSession>();

export function loadLiveBrowserSession(project: string): LiveBrowserSession | null {
  return live.get(project) ?? null;
}

export function saveLiveBrowserSession(project: string, session: LiveBrowserSession): void {
  live.set(project, session);
}

function keyFor(project: string): string {
  return `${PREFIX}${project}`;
}

export function loadBrowserSession(project: string): BrowserSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(project));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserSession;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBrowserSession(project: string, session: BrowserSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(keyFor(project), JSON.stringify(session));
  } catch {
    // A full or disabled store just means tabs are not remembered.
  }
}

/** Called when a project is removed, so its tabs do not outlive it. */
export function clearBrowserSession(project: string): void {
  live.delete(project);
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(keyFor(project));
}

/** The project a tab belongs to: tab ids are `<project>:<uuid>`. */
function projectOf(tabId: string): string {
  return tabId.slice(0, tabId.lastIndexOf(":"));
}

/**
 * Record a page a tab moved to while no pane was tracking it, as when an agent
 * drives the browser in the background, so a pane mounted later shows that
 * page instead of the one it last rendered.
 * @param tabId the tab
 * @param page the tab's new address or title
 */
export function recordTabPage(tabId: string, page: { url?: string; title?: string }): void {
  const project = projectOf(tabId);
  const current = live.get(project);
  if (current?.tabs.some((t) => t.id === tabId)) {
    const tabs = current.tabs.map((t) => (t.id === tabId ? { ...t, ...page } : t));
    live.set(project, { ...current, tabs });
  }
  const saved = loadBrowserSession(project);
  if (page.url && saved?.tabs.some((t) => t.id === tabId)) {
    const url = page.url;
    const tabs = saved.tabs.map((t) => (t.id === tabId ? { ...t, url } : t));
    saveBrowserSession(project, { ...saved, tabs });
  }
}

/**
 * The tab an agent acts in: the project's active tab as the pane last left it,
 * else as remembered from the last run. With `create`, a project with no tabs
 * gets one, made active.
 * @param project the project
 * @param create whether to add a tab when there is none
 * @returns the tab's id and address, or null
 */
export function agentTab(project: string, create = false): { id: string; url: string } | null {
  const current = live.get(project) ?? loadBrowserSession(project);
  const tab = current?.tabs.find((t) => t.id === current.activeId) ?? current?.tabs[0];
  if (tab) return { id: tab.id, url: tab.url };
  if (!create) return null;
  const id = `${project}:${crypto.randomUUID()}`;
  const url = "about:blank";
  live.set(project, {
    tabs: [{ id, url, title: "New tab", loading: false, entries: [url], pos: 0 }],
    activeId: id,
  });
  saveBrowserSession(project, { tabs: [{ id, url }], activeId: id });
  return { id, url };
}
