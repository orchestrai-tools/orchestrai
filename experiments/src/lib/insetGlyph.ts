import { ChevronRight, Circle, Diamond, GripVertical, Minus, Play, type LucideIcon } from 'lucide-react';
import type { InsetShape } from '../settings/types';

/** Lucide renders on a 24-unit grid; glyphs are scaled from that box. */
export const GLYPH_GRID = 24;

interface InsetGlyphSpec {
  icon: LucideIcon;
  filled: boolean;
  /** Drawn pointing right; mirrored to point left. */
  directional: boolean;
  rotateDeg: number;
}

export const INSET_GLYPHS: Record<InsetShape, InsetGlyphSpec> = {
  arrow: { icon: Play, filled: true, directional: true, rotateDeg: 0 },
  chevron: { icon: ChevronRight, filled: false, directional: true, rotateDeg: 0 },
  notch: { icon: Minus, filled: false, directional: false, rotateDeg: 90 },
  circle: { icon: Circle, filled: false, directional: false, rotateDeg: 0 },
  grip: { icon: GripVertical, filled: false, directional: false, rotateDeg: 0 },
  diamond: { icon: Diamond, filled: false, directional: false, rotateDeg: 0 },
};

const MIN_TAB_HEIGHT = 14;
const MIN_TAB_DEPTH = 8;
const MIN_GLYPH_SIZE = 6;

export interface GlyphPlacement {
  transform: string;
  opacity: number;
}

export const HIDDEN_GLYPH: GlyphPlacement = { transform: 'scale(0)', opacity: 0 };

/** The tab as the glyph sees it, in edge-local coordinates. */
export interface TabGlyphFrame {
  iconCenter: { x: number; y: number };
  height: number;
  depth: number;
}

export interface GlyphRequest {
  shape: InsetShape;
  sizePx: number;
  pointsLeft: boolean;
  /** -1 for a right-hand edge, so a positive X offset always moves toward the content. */
  outward: -1 | 1;
  offsetXPx: number;
  offsetYPx: number;
}

/** Positions a glyph in the tab, shrinking it to fit and hiding it when the tab is too small. */
export function placeInsetGlyph(geometry: TabGlyphFrame, request: GlyphRequest): GlyphPlacement {
  const fits = geometry.height >= MIN_TAB_HEIGHT && geometry.depth >= MIN_TAB_DEPTH;
  const size = Math.min(request.sizePx, geometry.depth * 0.75, geometry.height * 0.7);
  const visible = fits && size >= MIN_GLYPH_SIZE;
  const spec = INSET_GLYPHS[request.shape];
  const scale = Math.max(size, 0) / GLYPH_GRID;
  const mirror = spec.directional && request.pointsLeft ? -1 : 1;
  const x = geometry.iconCenter.x + request.outward * request.offsetXPx;
  const y = geometry.iconCenter.y + request.offsetYPx;

  return {
    transform: `translate(${x}px, ${y}px) rotate(${spec.rotateDeg}deg) scale(${scale * mirror}, ${scale}) translate(${-GLYPH_GRID / 2}px, ${-GLYPH_GRID / 2}px)`,
    opacity: visible ? 1 : 0,
  };
}
