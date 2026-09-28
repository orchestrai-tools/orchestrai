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

/**
 * Whether the native page would paint over an open overlay.
 *
 * @param page The placeholder the page is painted over.
 * @param overlays The overlays currently open.
 * @returns True when any modal is open or a floating overlay overlaps the page.
 */
export function isCovered(page: Rect, overlays: Overlay[]): boolean {
  return overlays.some((o) => o.modal || intersects(page, o.rect));
}

/**
 * Report whether an overlay covers the element, now and on every change. Checks
 * are batched to one per frame; the end of an animation re-checks, since a
 * sliding toast or menu moves without touching the DOM.
 *
 * @param el The placeholder the native page is painted over.
 * @param onChange Called with the initial verdict and each time it flips.
 * @returns A function that stops watching.
 */
export function watchOverlays(el: HTMLElement, onChange: (covered: boolean) => void): () => void {
  let covered: boolean | null = null;
  let frame = 0;
  const check = () => {
    frame = 0;
    const next = isCovered(rectOf(el), findOverlays(document.body));
    if (next === covered) return;
    covered = next;
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
