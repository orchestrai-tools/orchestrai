export const CHAT_BOTTOM_THRESHOLD_PX = 72;

export interface ScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function distanceFromBottom({ clientHeight, scrollHeight, scrollTop }: ScrollMetrics) {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isNearChatBottom(metrics: ScrollMetrics, threshold = CHAT_BOTTOM_THRESHOLD_PX) {
  return distanceFromBottom(metrics) <= threshold;
}

/**
 * Scrolling upward is an explicit opt-out, even inside the near-bottom zone.
 * Scrolling back down re-enables following once the viewport reaches that zone.
 */
export function shouldFollowAfterScroll(
  previousScrollTop: number,
  metrics: ScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
) {
  if (metrics.scrollTop < previousScrollTop - 0.5) {
    return false;
  }
  return isNearChatBottom(metrics, threshold);
}

/** Invalidates queued animation-frame scrolls when user intent detaches following. */
export function createChatFollowGate() {
  let generation = 0;
  return {
    cancel() {
      generation += 1;
    },
    isCurrent(token: number) {
      return token === generation;
    },
    issue() {
      generation += 1;
      return generation;
    },
  };
}

/**
 * Which row the transcript list may restore (anchor) its scroll position to.
 *
 * - While settling a work-group disclosure, only the toggled row: the trigger
 *   stays under the cursor instead of the viewport chasing the end.
 * - While reading away from the end, only the row at the top of the viewport
 *   (`"reading"`), so rows the session cap drops from the front do not pull the
 *   text away. Restoring every row (`"all"`) blanked rows as the list recycled.
 * - While following, nothing: the list's own end-pinning owns the scroll.
 */
export type TranscriptRestoreMode = "none" | "anchor" | "reading";

/**
 * @param following whether the view is pinned to the live edge
 * @param settling whether a work-group disclosure is settling
 * @param anchorKey the toggled row's id, if any
 * @returns which row the list restores
 */
export function transcriptRestoreMode(
  following: boolean,
  settling: boolean,
  anchorKey: string | null,
): TranscriptRestoreMode {
  if (settling && anchorKey !== null) return "anchor";
  if (!following) return "reading";
  return "none";
}

export interface RowRect {
  id: string;
  top: number;
  bottom: number;
}

/**
 * The topmost row intersecting the viewport. Geometry, not DOM order: the
 * recycling list leaves its containers in whatever order they were reused.
 *
 * @param rows row rects relative to the viewport top
 * @param viewportHeight the viewport's height
 * @returns the row's id, or null when none intersects
 */
export function topmostVisibleRowId(rows: readonly RowRect[], viewportHeight: number) {
  let best: RowRect | null = null;
  for (const row of rows) {
    if (row.bottom <= 0 || row.top >= viewportHeight) continue;
    if (best === null || row.top < best.top) best = row;
  }
  return best?.id ?? null;
}
