import { useEffect, useRef } from "react";

import { browser, type BrowserBounds } from "./browserClient";
import { type Overlay, visibleArea, watchOverlays } from "./overlayCover";

function boundsOf(el: HTMLElement): BrowserBounds {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Share of the placeholder that must be on screen for the page to show. It is
 *  also an observer threshold, so every change of that verdict is reported. */
const FULL = 0.995;

/** Long enough to cover the panes' swap animation. */
const FOLLOW_MS = 400;

interface Sighting {
  isIntersecting: boolean;
  intersectionRatio: number;
  boundingClientRect: { width: number; height: number };
}

/**
 * Whether the native page may be shown over the placeholder. A native view
 * cannot be clipped, so it may show only while the whole placeholder does.
 *
 * @param entry The placeholder's latest intersection record.
 * @returns True only when the placeholder is non-empty and fully on screen.
 */
export function isFullyOnScreen(entry: Sighting): boolean {
  const { width, height } = entry.boundingClientRect;
  return width > 0 && height > 0 && entry.isIntersecting && entry.intersectionRatio >= FULL;
}

/**
 * Keep the active tab's native webview glued to the placeholder, and shown only
 * while the placeholder is fully on screen and no dialog is open: a folded pane
 * keeps it mounted and merely clips it, which nothing but an intersection check
 * sees.
 *
 * @param activeTabId The tab whose webview is driven, or null when none shows.
 * @param ref The placeholder the webview is painted over.
 * @param moved Changes when the placeholder moves without resizing, as when
 *   the panes swap sides.
 */
export function useBrowserViewport(
  activeTabId: string | null,
  ref: React.RefObject<HTMLElement | null>,
  moved?: unknown,
) {
  const seen = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!activeTabId || !el) {
      seen.current = false;
      return;
    }

    let cancelled = false;
    let shown: boolean | null = null;
    let overlays: Overlay[] = [];
    const area = () => visibleArea(boundsOf(el), overlays);
    const sync = () => {
      const bounds = area();
      if (!cancelled && bounds) void browser.setBounds(activeTabId, bounds);
    };
    const apply = (visible: boolean) => {
      if (cancelled || visible === shown) return;
      shown = visible;
      void browser.setVisible(activeTabId, visible).then(() => {
        if (visible) sync();
      });
    };

    // On a tab switch the previous tab's verdict still holds for the same
    // placeholder, so the page shows now instead of on the first report.
    let onScreen: boolean | null = seen.current ? true : null;
    const update = () => {
      if (area() === null) apply(false);
      else if (onScreen !== null) {
        apply(onScreen);
        if (onScreen) sync();
      }
    };
    const intersection = new IntersectionObserver(
      (entries) => {
        seen.current = isFullyOnScreen(entries[entries.length - 1]);
        onScreen = seen.current;
        update();
      },
      { threshold: [0, FULL] },
    );
    intersection.observe(el);
    // The native page paints above every DOM layer: it shrinks away from an
    // open menu or toast and hides under a dialog; hiding keeps the page loaded.
    const stopOverlays = watchOverlays((next) => {
      overlays = next;
      update();
    });

    // The placeholder moves with the split resizer and the window; a scroll of
    // an ancestor moves it too. ResizeObserver catches size, the listeners catch
    // position.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    return () => {
      cancelled = true;
      intersection.disconnect();
      stopOverlays();
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      void browser.setVisible(activeTabId, false);
    };
  }, [activeTabId, ref]);

  // The swap is a transform animation, which no observer or event reports, so
  // the page follows the placeholder frame by frame until it has settled.
  const lastMoved = useRef(moved);
  useEffect(() => {
    if (lastMoved.current === moved) return;
    lastMoved.current = moved;
    const el = ref.current;
    if (!activeTabId || !el) return;

    const until = performance.now() + FOLLOW_MS;
    let sent = "";
    let frame = 0;
    const follow = () => {
      const bounds = boundsOf(el);
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
      if (key !== sent) {
        sent = key;
        void browser.setBounds(activeTabId, bounds);
      }
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [activeTabId, moved, ref]);
}
