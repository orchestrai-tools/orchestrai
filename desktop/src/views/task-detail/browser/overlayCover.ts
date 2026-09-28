/** A rectangle in viewport CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Overlay {
  rect: Rect;
  /** A modal blocks the whole app, so it covers the page wherever it sits. */
  modal: boolean;
}

/** Open dialogs: Radix sets `data-state`, the hand-rolled ones set `aria-modal`. */
const MODAL =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [aria-modal="true"]';

/** Menus, popovers, selects, tooltips and toasts cover only what they overlap. */
const FLOATING =
  '[data-radix-popper-content-wrapper], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-sonner-toast]';

const POPPER = "[data-radix-popper-content-wrapper]";

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/**
 * Collect the overlays currently open in the document.
 *
 * @param root The subtree to search, normally `document.body`.
 * @returns Every open overlay with its on-screen rectangle.
 */
export function findOverlays(root: ParentNode): Overlay[] {
  const found: Overlay[] = [];
  for (const el of root.querySelectorAll(MODAL)) {
    // A Radix popover's content is a role=dialog too, but it only floats.
    if (!el.closest(POPPER)) found.push({ rect: rectOf(el), modal: true });
  }
  for (const el of root.querySelectorAll(FLOATING)) {
    found.push({ rect: rectOf(el), modal: false });
  }
  return found;
}

function intersects(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A page cut narrower or shorter than this is hidden instead. */
const MIN_SIDE = 120;

function areaOf(r: Rect): number {
  return Math.max(r.width, 0) * Math.max(r.height, 0);
}

/**
 * The part of the page the native view may occupy without painting over an
 * overlay: the largest free strip beside each floating overlay it meets.
 *
 * @param page The placeholder the page is painted over.
 * @param overlays The overlays currently open.
 * @returns The rectangle to show the page in, or null to hide it.
 */
export function visibleArea(page: Rect, overlays: Overlay[]): Rect | null {
  if (overlays.some((o) => o.modal)) return null;
  let area = page;
  for (const { rect } of overlays) {
    if (!intersects(area, rect)) continue;
    const bottom = area.y + area.height;
    const right = area.x + area.width;
    const strips: Rect[] = [
      { ...area, height: rect.y - area.y },
      { ...area, y: rect.y + rect.height, height: bottom - rect.y - rect.height },
      { ...area, width: rect.x - area.x },
      { ...area, x: rect.x + rect.width, width: right - rect.x - rect.width },
    ];
    area = strips.reduce((best, strip) => (areaOf(strip) > areaOf(best) ? strip : best));
    if (area.width < MIN_SIDE || area.height < MIN_SIDE) return null;
  }
  return area;
}

/**
 * Report the open overlays, now and on every change. Checks are batched to one
 * per frame; the end of an animation re-checks, since a sliding toast or menu
 * moves without touching the DOM.
 *
 * @param onChange Called with the initial overlays and each time they change.
 * @returns A function that stops watching.
 */
export function watchOverlays(onChange: (overlays: Overlay[]) => void): () => void {
  let last: string | null = null;
  let frame = 0;
  const check = () => {
    frame = 0;
    const next = findOverlays(document.body);
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    onChange(next);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state", "data-expanded", "aria-modal", "style"],
  });
  document.addEventListener("animationend", schedule, true);
  document.addEventListener("transitionend", schedule, true);
  check();

  return () => {
    observer.disconnect();
    document.removeEventListener("animationend", schedule, true);
    document.removeEventListener("transitionend", schedule, true);
    if (frame) cancelAnimationFrame(frame);
  };
}
