import type { GridLayerSettings, GridSymbol } from '../settings/types';

/**
 * A background grid as one SVG tile, used as a CSS background image so the
 * browser rasterizes it once and repeats it for free.
 *
 * Raised and inset symbols are lit from the top left: a light and a dark copy
 * are offset diagonally behind a face cut from the surface colour, so only
 * their edges show, like an emboss.
 */
export interface GridTileColors {
  /** The region's background, used for the face of raised and inset symbols. */
  surface: string;
  ink: string;
}

export interface GridTile {
  image: string;
  size: string;
}

interface Paint {
  color: string;
  opacity: number;
  dx?: number;
  dy?: number;
}

const HIGHLIGHT = '#fff';
const SHADOW = '#000';
const MIN_STROKE_PX = 0.75;
const STROKE_RATIO = 0.22;

const round = (value: number) => Math.round(value * 100) / 100;

function symbolMarkup(symbol: GridSymbol, center: number, size: number, paint: Paint): string {
  const c = center;
  const r = size / 2;
  const stroke = round(Math.max(MIN_STROKE_PX, size * STROKE_RATIO));
  const fill = `fill="${paint.color}" fill-opacity="${round(paint.opacity)}"`;
  const line = `fill="none" stroke="${paint.color}" stroke-opacity="${round(paint.opacity)}" stroke-width="${stroke}" stroke-linecap="round"`;

  let shape: string;
  switch (symbol) {
    case 'dot':
      shape = `<circle cx="${c}" cy="${c}" r="${round(r)}" ${fill}/>`;
      break;
    case 'ring':
      shape = `<circle cx="${c}" cy="${c}" r="${round(Math.max(stroke / 2, r - stroke / 2))}" ${line}/>`;
      break;
    case 'plus':
      shape = `<path d="M${round(c - r)} ${c}H${round(c + r)}M${c} ${round(c - r)}V${round(c + r)}" ${line}/>`;
      break;
    case 'cross': {
      const d = round(r * Math.SQRT1_2);
      shape = `<path d="M${round(c - d)} ${round(c - d)}L${round(c + d)} ${round(c + d)}M${round(c + d)} ${round(c - d)}L${round(c - d)} ${round(c + d)}" ${line}/>`;
      break;
    }
    case 'square':
      shape = `<rect x="${round(c - r)}" y="${round(c - r)}" width="${round(size)}" height="${round(size)}" ${fill}/>`;
      break;
    case 'diamond':
      shape = `<path d="M${c} ${round(c - r)}L${round(c + r)} ${c}L${c} ${round(c + r)}L${round(c - r)} ${c}Z" ${fill}/>`;
      break;
  }

  const { dx = 0, dy = 0 } = paint;
  return dx || dy ? `<g transform="translate(${round(dx)} ${round(dy)})">${shape}</g>` : shape;
}

function layers(layer: GridLayerSettings, colors: GridTileColors): Paint[] {
  const alpha = layer.opacityPercent / 100;
  const d = layer.reliefPx;
  const face = { color: colors.surface, opacity: 1 };

  switch (layer.relief) {
    case 'flat':
      return [{ color: colors.ink, opacity: alpha }];
    case 'raised':
      return [
        { color: HIGHLIGHT, opacity: alpha, dx: -d, dy: -d },
        { color: SHADOW, opacity: Math.min(1, alpha * 2), dx: d, dy: d },
        face,
        { color: colors.ink, opacity: alpha * 0.35 },
      ];
    case 'inset':
      return [
        { color: SHADOW, opacity: Math.min(1, alpha * 2), dx: -d, dy: -d },
        { color: HIGHLIGHT, opacity: alpha * 0.8, dx: d, dy: d },
        face,
        { color: SHADOW, opacity: alpha * 0.6 },
      ];
  }
}

/** Builds the tile for one region, or null when its grid is off. */
export function buildGridTile(layer: GridLayerSettings, colors: GridTileColors): GridTile | null {
  if (!layer.enabled) return null;
  const spacing = Math.max(2, Math.round(layer.spacingPx));
  const center = spacing / 2;
  const body = layers(layer, colors)
    .map((paint) => symbolMarkup(layer.symbol, center, layer.sizePx, paint))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spacing}" height="${spacing}" viewBox="0 0 ${spacing} ${spacing}">${body}</svg>`;
  return {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    size: `${spacing}px ${spacing}px`,
  };
}
