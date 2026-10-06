import { easeOut, transform } from 'motion';
import type { Side, SidebarSettings } from '../settings/types';

/**
 * An edge in its own local frame: x runs across the track (0 = left side of
 * the track), y runs down from the top. Pointer positions are mapped into
 * this frame by inverting the surface's rendered transform.
 */
export interface EdgeZone {
  side: Side;
  trackWidth: number;
  height: number;
  handlePadding: number;
}

export interface EdgeSample {
  localX: number;
  localY: number;
  /** Signed distance from the content-facing boundary: positive in the content, negative toward the sidebar. */
  depth: number;
  handleDistance: number;
  overHandle: boolean;
  inWater: boolean;
  withinBand: boolean;
}

const VERTICAL_SLACK_PX = 60;

/** Screen skew applied to an edge. Collapsed edges straighten so the rail hugs the window. */
export function edgeSkewDeg(side: Side, sidebar: SidebarSettings): number {
  if (sidebar.collapsed) return 0;
  return side === 'left' ? -sidebar.angleDeg : sidebar.angleDeg;
}

export function skewMatrix(skewDeg: number): DOMMatrixReadOnly {
  return new DOMMatrix().skewX(skewDeg);
}

/** The surface's rendered transform; only needed while its skew is transitioning. */
export function readSurfaceMatrix(surface: Element): DOMMatrixReadOnly {
  const computed = getComputedStyle(surface).transform;
  return new DOMMatrix(computed === 'none' ? undefined : computed);
}

/**
 * Inverse of the surface's transform about its centre (CSS default origin),
 * mapping frame-relative points into the surface's local frame.
 */
export function frameToSurface(
  surfaceMatrix: DOMMatrixReadOnly,
  width: number,
  height: number,
): DOMMatrixReadOnly {
  return new DOMMatrix()
    .translate(width / 2, height / 2)
    .multiply(surfaceMatrix)
    .translate(-width / 2, -height / 2)
    .inverse();
}

/**
 * Cheap rejection before any matrix work: the farthest a pointer can be from
 * the edge's centre line and still matter (attraction, slant, padding).
 */
export function maxReachPx(zone: EdgeZone, attractRangePx: number, skewDeg: number): number {
  const slant = (zone.height / 2) * Math.abs(Math.tan((skewDeg * Math.PI) / 180));
  return Math.max(0, attractRangePx) + zone.trackWidth + zone.handlePadding + slant;
}

export function sampleEdge(local: DOMPointReadOnly, zone: EdgeZone): EdgeSample {
  const { x: localX, y: localY } = local;
  const depth = zone.side === 'left' ? localX - zone.trackWidth : -localX;
  const handleDistance =
    depth > 0 ? depth : depth < -zone.trackWidth ? -zone.trackWidth - depth : 0;
  const withinHeight = localY >= 0 && localY <= zone.height;

  return {
    localX,
    localY,
    depth,
    handleDistance,
    overHandle: withinHeight && handleDistance <= zone.handlePadding,
    inWater: withinHeight && depth <= 0 && depth >= -zone.trackWidth,
    withinBand: localY >= -VERTICAL_SLACK_PX && localY <= zone.height + VERTICAL_SLACK_PX,
  };
}

/** 0..1 attraction toward the edge. A range of 0 means "only while touching the handle". */
export function magneticPull(sample: EdgeSample, rangePx: number): number {
  if (!sample.withinBand) return 0;
  if (rangePx <= 0) return sample.overHandle ? 1 : 0;
  return transform(sample.handleDistance, [rangePx, 0], [0, 1], { ease: easeOut });
}
