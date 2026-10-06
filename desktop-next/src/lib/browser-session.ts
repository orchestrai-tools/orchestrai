import type { BrowserNav } from "./browser-page";

export interface BrowserTabSession {
  active: string;
  tabs: string[];
  urls: Record<string, string>;
}

const PREFIX = "orc-browser.";
const navs = new Map<string, Record<string, BrowserNav>>();
const titles = new Map<string, Record<string, string>>();

export function emptyBrowserSession(taskId: string): BrowserTabSession {
  const base = `task-${taskId}`;
  return { active: base, tabs: [base], urls: { [base]: "" } };
}

/** The next suffix for a tab id, past any tab already open. */
export function browserTabSeq(taskId: string, tabs: readonly string[]): number {
  const base = `task-${taskId}`;
  let next = 1;
  for (const tab of tabs) {
    if (!tab.startsWith(`${base}-`)) continue;
    const value = Number(tab.slice(base.length + 1));
    if (Number.isFinite(value)) next = Math.max(next, value + 1);
  }
  return next;
}

/** Tabs last opened for this task, or null when nothing was saved. */
export function readBrowserSession(taskId: string): BrowserTabSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + taskId) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as { active?: unknown; tabs?: unknown; urls?: unknown };
    if (!Array.isArray(row.tabs)) return null;
    const tabs = row.tabs.filter((tab) => typeof tab === "string" && tab.length > 0);
    if (tabs.length === 0) return null;
    const active =
      typeof row.active === "string" && tabs.includes(row.active) ? row.active : tabs[0];
    const urls: Record<string, string> = {};
    const stored =
      row.urls && typeof row.urls === "object" ? (row.urls as Record<string, unknown>) : {};
    for (const tab of tabs) urls[tab] = typeof stored[tab] === "string" ? stored[tab] : "";
    return { active, tabs, urls };
  } catch {
    return null;
  }
}

export function writeBrowserSession(taskId: string, session: BrowserTabSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + taskId, JSON.stringify(session));
  } catch {
    // A full store just means the tabs are not remembered.
  }
}

/** History for this app run. A restarted window keeps the open address, not the trail. */
export function readBrowserNavs(taskId: string): Record<string, BrowserNav> {
  return navs.get(taskId) ?? {};
}

export function rememberBrowserNav(taskId: string, tabId: string, nav: BrowserNav): void {
  navs.set(taskId, { ...navs.get(taskId), [tabId]: nav });
}

export function readBrowserTitles(taskId: string): Record<string, string> {
  return titles.get(taskId) ?? {};
}

export function rememberBrowserTitle(taskId: string, tabId: string, title: string): void {
  titles.set(taskId, { ...titles.get(taskId), [tabId]: title });
}

export function forgetBrowserNav(taskId: string, tabId: string): void {
  const current = navs.get(taskId);
  if (current) {
    const next = { ...current };
    delete next[tabId];
    navs.set(taskId, next);
  }
  const named = titles.get(taskId);
  if (!named) return;
  const rest = { ...named };
  delete rest[tabId];
  titles.set(taskId, rest);
}

export function clearBrowserSession(taskId: string): void {
  navs.delete(taskId);
  titles.delete(taskId);
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PREFIX + taskId);
}
