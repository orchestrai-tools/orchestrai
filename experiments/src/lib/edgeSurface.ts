import { pathRound } from 'd3-path';
import type { BorderBand } from '../settings/presets';
import type { Side } from '../settings/types';
import { tabOutline, type ResolvedTab, type TabPoint } from './tabProfile';

/**
 * The sidebar edge as one surface: a straight boundary, displaced by waves,
 * with the magnet tab as a bump on it. The border is drawn from the same
 * outline, so it ripples and wraps the tab instead of being a separate line.
 */
export interface SurfaceShape {
  side: Side;
  trackWidth: number;
  height: number;
  band: BorderBand;
  /** Largest possible inward displacement, so the body always reaches past any trough. */
  maxAmplitude: number;
}

/**
 * `fill`: the border fills the whole track, so it is the band between the
 * surface and the track's inner side, and it fills the tab.
 * `stroke`: a thinner line, drawn as a stroke along a parallel of the surface.
 */
export type BorderMode = 'fill' | 'stroke';

export interface SurfacePaths {
  /** Content colour under troughs that dip past the track into the sidebar panel. */
  gap: string;
  /** The sidebar colour, from inside the sidebar out to the surface (tab included). */
  body: string;
  border: string;
}

type Displacement = (y: number) => number;
type Point = readonly [x: number, y: number];

const SEAM_OVERLAP_PX = 1;
const PATH_PRECISION = 2;

export function borderMode(band: BorderBand, trackWidth: number): BorderMode {
  return band.widthPx >= trackWidth ? 'fill' : 'stroke';
}

/** The surface, or a parallel of it `inset` px inside, as edge-local points from top to bottom. */
function edgeLine(
  shape: SurfaceShape,
  displacement: Displacement,
  stepPx: number,
  inset: number,
  tab: ResolvedTab | null,
): Point[] {
  const outward = shape.side === 'left' ? 1 : -1;
  const contentX = shape.side === 'left' ? shape.trackWidth : 0;
  const toEdge = ([u, y]: TabPoint): Point => [contentX + outward * (u + displacement(y)), y];

  const points: Point[] = [];
  const straight = (from: number, to: number) => {
    if (to < from) return;
    const count = Math.max(1, Math.ceil((to - from) / stepPx));
    for (let index = 0; index <= count; index++) {
      points.push(toEdge([-inset, Math.min(to, from + ((to - from) * index) / count)]));
    }
  };

  if (!tab) {
    straight(0, shape.height);
    return points;
  }
  straight(0, tab.startY);
  for (const point of tabOutline(tab, inset)) points.push(toEdge(point));
  straight(tab.endY, shape.height);
  return points;
}

function polygon(points: readonly Point[]) {
  const path = pathRound(PATH_PRECISION);
  points.forEach(([x, y], index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path.toString();
}

function polyline(points: readonly Point[]) {
  const path = pathRound(PATH_PRECISION);
  points.forEach(([x, y], index) => (index === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  return path.toString();
}

/** Builds every surface path, sampling straight runs every `stepPx` (pass Infinity for a still surface). */
export function buildEdgeSurface(
  shape: SurfaceShape,
  displacement: Displacement,
  stepPx: number,
  tab: ResolvedTab | null,
): SurfacePaths {
  const inward = shape.side === 'left' ? -1 : 1;
  const contentX = shape.side === 'left' ? shape.trackWidth : 0;
  const farX = contentX + inward * (shape.trackWidth + shape.maxAmplitude + SEAM_OVERLAP_PX);

  const surface = edgeLine(shape, displacement, stepPx, 0, tab);
  if (surface.length === 0) return { gap: '', body: '', border: '' };
  const first = surface[0];
  const last = surface[surface.length - 1];

  const body = polygon([[farX, first[1]], ...surface, [farX, last[1]]]);
  const gap = polygon([[contentX, first[1]], ...surface, [contentX, last[1]]]);

  const { band } = shape;
  let border = '';
  if (band.widthPx > 0) {
    if (borderMode(band, shape.trackWidth) === 'fill') {
      const inner = edgeLine(shape, displacement, stepPx, shape.trackWidth, null);
      border = polygon([...surface, ...inner.reverse()]);
    } else {
      border = polyline(edgeLine(shape, displacement, stepPx, band.insetPx + band.widthPx / 2, tab));
    }
  }

  return { gap, body, border };
}
