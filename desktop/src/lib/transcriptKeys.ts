import type { SessionUpdate } from "../protocol";

const ALIGN_PROBES = 8;

/**
 * Updates the session cap dropped from the front: the cap slices, so survivors
 * keep their identity. The new front may be a fresh copy (a frame folded into
 * it), so the first few are probed; a rebuilt transcript counts as zero.
 *
 * @param previous the transcript as last rendered
 * @param next the transcript about to render
 * @returns the number of leading updates of `previous` missing from `next`
 */
export function droppedFromFront(
  previous: readonly SessionUpdate[],
  next: readonly SessionUpdate[],
): number {
  if (next.length === 0 || previous[0] === next[0]) return 0;
  for (let offset = 0; offset < Math.min(ALIGN_PROBES, next.length); offset += 1) {
    const index = previous.indexOf(next[offset]);
    if (index >= 0) return Math.max(0, index - offset);
  }
  return 0;
}
