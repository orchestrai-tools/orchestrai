import { clamp } from 'es-toolkit';

/**
 * The magnet tab as a bump on the edge. Coordinates are in tab space: `u` is
 * the distance outward from the edge toward the content, `y` runs down.
 * The outline is made only of axis-aligned lines and quarter circles
 * (concave flares where it leaves the edge, outer corners from sharp to a
 * half circle), so exact parallel offsets are just adjusted radii.
 */
export interface TabInput {
  containerHeight: number;
  centerY: number;
  /** How far the tab currently protrudes. */
  depth: number;
  height: number;
  cornerRadius: number;
  mergeRadius: number;
}

export interface ResolvedTab {
  centerY: number;
  half: number;
  depth: number;
  corner: number;
  merge: number;
  /** Where the flares meet the edge; the same for every offset of the outline. */
  startY: number;
  endY: number;
}

export type TabPoint = readonly [u: number, y: number];

const MIN_HEIGHT = 5;
const ARC_STEP_PX = 1.5;
const MAX_ARC_SEGMENTS = 12;

/** Clamps the request to the container and fits both radii into the tab's depth. */
export function resolveTab(input: TabInput): ResolvedTab {
  const totalHeight = Math.max(1, input.containerHeight);
  const depth = Math.max(0, input.depth);
  const height = clamp(input.height, MIN_HEIGHT, totalHeight);
  const half = height / 2;

  let corner = clamp(input.cornerRadius, 0, half);
  let merge = clamp(input.mergeRadius, 0, (totalHeight - height) / 2);
  if (corner + merge > depth) {
    const scale = depth / Math.max(corner + merge, Number.EPSILON);
    corner *= scale;
    merge *= scale;
  }

  const minCenter = half + merge;
  const maxCenter = totalHeight - half - merge;
  const centerY = minCenter >= maxCenter ? totalHeight / 2 : clamp(input.centerY, minCenter, maxCenter);

  return {
    centerY,
    half,
    depth,
    corner,
    merge,
    startY: centerY - half - merge,
    endY: centerY + half + merge,
  };
}

function arc(points: TabPoint[], cu: number, cy: number, radius: number, from: number, to: number) {
  if (radius <= 0) {
    points.push([cu, cy]);
    return;
  }
  const segments = clamp(Math.ceil(radius / ARC_STEP_PX), 2, MAX_ARC_SEGMENTS);
  for (let index = 0; index <= segments; index++) {
    const angle = from + ((to - from) * index) / segments;
    points.push([cu + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
}

/**
 * The outline from the top flare to the bottom flare, offset `inset` px
 * inward (into the sidebar) as a true parallel curve: the edge and the outer
 * face move by `inset`, convex corners shrink and concave flares grow by it.
 */
export function tabOutline(tab: ResolvedTab, inset = 0): TabPoint[] {
  const base = -inset;
  const outer = tab.depth - inset;
  const top = tab.centerY - Math.max(0, tab.half - inset);
  const bottom = tab.centerY + Math.max(0, tab.half - inset);
  let corner = Math.max(0, tab.corner - inset);
  let merge = tab.merge + inset;
  const run = outer - base;
  if (corner + merge > run) {
    const scale = run / Math.max(corner + merge, Number.EPSILON);
    corner *= scale;
    merge *= scale;
  }

  const points: TabPoint[] = [];
  const quarter = Math.PI / 2;
  arc(points, base + merge, top - merge, merge, Math.PI, quarter);
  arc(points, outer - corner, top + corner, corner, -quarter, 0);
  arc(points, outer - corner, bottom - corner, corner, 0, quarter);
  arc(points, base + merge, bottom + merge, merge, -quarter, -Math.PI);
  return points;
}
