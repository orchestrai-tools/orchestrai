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
