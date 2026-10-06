import { useEffect, useRef, useState, type RefObject } from "react";
import { annotationLabel, formatAnnotation, type BrowserAnnotation } from "../../lib/annotation";
import {
  browserNavOnState,
  canGoBack,
  canGoForward,
  emptyBrowserNav,
  isStartUrl,
  loadStalled,
  type BrowserNav,
} from "../../lib/browser-page";
import {
  browserTabSeq,
  emptyBrowserSession,
  forgetBrowserNav,
  readBrowserNavs,
  readBrowserSession,
  readBrowserTitles,
  rememberBrowserNav,
  rememberBrowserTitle,
  writeBrowserSession,
} from "../../lib/browser-session";
import { setContextImage } from "../../lib/composer-chips";

const STALL_MS = 15_000;

function inTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function browserCall(command: string, args: Record<string, unknown>) {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(command, args);
}

/** Subscribe to one native browser event for the life of the effect. */
function useBrowserEvent<T>(name: string, handler: (payload: T) => void, deps: unknown[]) {
  useEffect(() => {
    if (!inTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<T>(name, (event) => handler(event.payload)).then((off) => {
        if (cancelled) off();
        else unlisten = off;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, deps);
}

/**
 * The task's browser tabs: which are open, each one's address and history,
 * and the native webview kept over `host`. Tabs, addresses, history, and
 * titles survive reopening the task.
 */
export function useBrowserTabs({
  taskId,
  host,
  address,
  onPick,
}: {
  taskId: string;
  host: RefObject<HTMLDivElement | null>;
  address: RefObject<HTMLInputElement | null>;
  onPick: (text: string, label: string) => string | null;
}) {
  const base = `task-${taskId}`;
  const [restored] = useState(() => readBrowserSession(taskId) ?? emptyBrowserSession(taskId));
  const seq = useRef(browserTabSeq(taskId, restored.tabs));
  const [tabs, setTabs] = useState<string[]>(restored.tabs);
  const [active, setActive] = useState(restored.active);
  const [urls, setUrls] = useState<Record<string, string>>(restored.urls);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const [loadingSince, setLoadingSince] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  const [navs, setNavs] = useState<Record<string, BrowserNav>>(() => readBrowserNavs(taskId));
  const [titles, setTitles] = useState<Record<string, string>>(() => readBrowserTitles(taskId));
  const pendingMove = useRef(new Map<string, number>());
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const url = urls[active] ?? "";
  const nav = navs[active] ?? emptyBrowserNav(url);
  const onStart = isStartUrl(url);

  function setNav(tabId: string, next: BrowserNav) {
    rememberBrowserNav(taskId, tabId, next);
    setNavs((current) => ({ ...current, [tabId]: next }));
  }

  function openTab() {
    const next = `${base}-${seq.current++}`;
    setTabs((current) => [...current, next]);
    setUrls((current) => ({ ...current, [next]: "" }));
    setActive(next);
  }

  useEffect(() => setDraft(urls[active] ?? ""), [active, urls]);
  useEffect(
    () => writeBrowserSession(taskId, { active, tabs, urls }),
    [taskId, tabs, active, urls],
  );
  useEffect(() => {
    setStalled(false);
    setLoadingSince(null);
  }, [active]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key === "t") {
        event.preventDefault();
        openTab();
      } else if (event.key === "l") {
        event.preventDefault();
        address.current?.focus();
        address.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useBrowserEvent<{ tabId: string; url?: string; loading?: boolean }>(
    "browser:state",
    ({ tabId, url: nextUrl = "", loading }) => {
      const isLoading = Boolean(loading);
      setNavs((current) => {
        const prev = current[tabId] ?? emptyBrowserNav();
        const move = isLoading ? pendingMove.current.get(tabId) : undefined;
        if (move !== undefined) pendingMove.current.delete(tabId);
        const next = browserNavOnState(prev, nextUrl, isLoading, move);
        rememberBrowserNav(taskId, tabId, next);
        return { ...current, [tabId]: next };
      });
      if (tabId !== active) return;
      if (isLoading) setLoadingSince((current) => current ?? Date.now());
      else {
        setLoadingSince(null);
        setStalled(false);
      }
      if (nextUrl && !isStartUrl(nextUrl)) {
        setUrls((current) => ({ ...current, [active]: nextUrl }));
        setDraft(nextUrl);
      }
    },
    [active, taskId],
  );

  useBrowserEvent<{ tabId: string; title?: string }>(
    "browser:title",
    ({ tabId, title }) => {
      const text = title?.trim() ?? "";
      if (!text) return;
      rememberBrowserTitle(taskId, tabId, text);
      setTitles((current) => ({ ...current, [tabId]: text }));
    },
    [taskId],
  );

  useBrowserEvent<{ tabId: string; annotation: BrowserAnnotation }>(
    "browser:annotation",
    ({ tabId, annotation }) => {
      if (tabId !== active) return;
      const id = onPickRef.current(formatAnnotation(annotation), annotationLabel(annotation));
      const rect = annotation.rect;
      if (id && rect && rect.width > 0 && rect.height > 0) {
        void browserCall("browser_capture_element", {
          tabId,
          captureId: id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
      setPicking(false);
    },
    [active],
  );

  useBrowserEvent<{ captureId: string; pngBase64: string }>(
    "browser:shot",
    ({ captureId, pngBase64 }) =>
      setContextImage(captureId, { name: `element-${Date.now()}.png`, data: pngBase64 }),
    [],
  );

  useEffect(() => {
    if (!inTauri() || onStart || loadingSince == null) return;
    const timer = window.setTimeout(() => {
      if (loadStalled(loadingSince, Date.now(), STALL_MS)) {
        setStalled(true);
        void browserCall("browser_set_visible", { tabId: active, visible: false });
      }
    }, STALL_MS);
    return () => window.clearTimeout(timer);
  }, [active, onStart, loadingSince]);

  useEffect(() => {
    const node = host.current;
    if (!node || onStart || stalled) {
      void browserCall("browser_set_visible", { tabId: active, visible: false });
      return;
    }
    const place = () => {
      const rect = node.getBoundingClientRect();
      void browserCall("browser_open", {
        tabId: active,
        url,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        reuse: true,
        hidden: false,
      });
    };
    place();
    const observer = new ResizeObserver(() => place());
    observer.observe(node);
    return () => {
      observer.disconnect();
      void browserCall("browser_set_visible", { tabId: active, visible: false });
    };
  }, [active, onStart, stalled, url, host]);

  function go(next: string) {
    setNav(active, browserNavOnState(navs[active] ?? emptyBrowserNav(), next, true));
    setUrls((current) => ({ ...current, [active]: next }));
    setDraft(next);
    setStalled(false);
    setLoadingSince(Date.now());
    void browserCall("browser_navigate", { tabId: active, url: next });
  }

  function step(delta: -1 | 1) {
    if (delta < 0 ? !canGoBack(nav) : !canGoForward(nav)) return;
    if (!inTauri()) {
      const pos = nav.pos + delta;
      const nextUrl = nav.entries[pos] ?? "";
      setNav(active, { ...nav, pos, loading: false });
      setUrls((current) => ({ ...current, [active]: nextUrl }));
      setDraft(nextUrl);
      return;
    }
    pendingMove.current.set(active, delta);
    void browserCall(delta < 0 ? "browser_back" : "browser_forward", { tabId: active });
  }

  function reloadOrStop() {
    if (nav.loading) {
      setNav(active, { ...nav, loading: false });
      setLoadingSince(null);
      void browserCall("browser_stop", { tabId: active });
      return;
    }
    setLoadingSince(Date.now());
    void browserCall("browser_reload", { tabId: active });
  }

  function retry() {
    setStalled(false);
    setLoadingSince(Date.now());
    void browserCall("browser_set_visible", { tabId: active, visible: true });
    void browserCall("browser_reload", { tabId: active });
  }

  function togglePick() {
    const next = !picking;
    setPicking(next);
    void browserCall(next ? "browser_pick" : "browser_pick_stop", { tabId: active });
  }

  function closeTab(id: string) {
    forgetBrowserNav(taskId, id);
    setNavs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    void browserCall("browser_close", { tabId: id });
    const rest = tabs.filter((tab) => tab !== id);
    const next = rest.length > 0 ? rest : [base];
    setTabs(next);
    if (active === id) setActive(next[0] ?? base);
  }

  return {
    tabs,
    active,
    setActive,
    urls,
    titles,
    url,
    nav,
    draft,
    setDraft,
    picking,
    stalled,
    onStart,
    openTab,
    closeTab,
    go,
    step,
    reloadOrStop,
    retry,
    togglePick,
  };
}
