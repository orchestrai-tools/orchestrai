/** A new tab has not opened a page yet. */
export function isStartUrl(url: string): boolean {
  const value = url.trim();
  return value === "" || value === "https://" || value === "http://" || value === "about:blank";
}

/** A load that never settles is treated as unreachable. */
export function loadStalled(startedAt: number, now: number, waitMs = 15_000): boolean {
  return now - startedAt >= waitMs;
}

/** Pages this tab has opened, and whether one is still loading. */
export interface BrowserNav {
  entries: string[];
  pos: number;
  loading: boolean;
}

export function emptyBrowserNav(url = ""): BrowserNav {
  return { entries: [url], pos: 0, loading: false };
}

export function canGoBack(nav: BrowserNav | undefined): boolean {
  return !!nav && nav.pos > 0;
}

export function canGoForward(nav: BrowserNav | undefined): boolean {
  return !!nav && nav.pos < nav.entries.length - 1;
}

/** The tab strip label: the page title, otherwise the host, otherwise New tab. */
export function browserTabLabel(title: string | undefined, url: string): string {
  const named = title?.trim();
  if (named) return named;
  if (!isStartUrl(url)) {
    try {
      const host = new URL(url).host;
      if (host) return host;
    } catch {
      // A typed address that is not a URL yet stays a new tab.
    }
  }
  return "New tab";
}

/**
 * History advances when a load starts at a new address. The first real page
 * replaces the blank start entry. A back or forward step is applied once.
 */
export function browserNavOnState(
  nav: BrowserNav,
  url: string,
  loading: boolean,
  pendingMove?: number,
): BrowserNav {
  if (!loading) return { ...nav, loading: false };
  if (pendingMove !== undefined) {
    const pos = Math.min(Math.max(nav.pos + pendingMove, 0), Math.max(nav.entries.length - 1, 0));
    return { ...nav, loading: true, pos };
  }
  const current = nav.entries[nav.pos] ?? "";
  if (url === current || isStartUrl(url)) return { ...nav, loading: true };
  if (isStartUrl(current)) {
    const entries = [...nav.entries];
    entries[nav.pos] = url;
    return { ...nav, entries, loading: true };
  }
  const entries = [...nav.entries.slice(0, nav.pos + 1), url];
  return { entries, pos: entries.length - 1, loading: true };
}
