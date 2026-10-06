import { useMemo } from 'react';
import { resolveTab, tabOutline } from '../../../lib/tabProfile';
import type { MagnetSettings } from '../../../settings/types';

const PREVIEW_TRACK = 10;
const PREVIEW_PADDING = 12;

/** Draws the magnet tab with the same geometry the edge uses, at full pull. */
export function ExtrusionPreview({ settings }: { settings: MagnetSettings }) {
  const preview = useMemo(() => {
    const containerHeight = settings.heightPx + settings.mergeRadiusPx * 2 + PREVIEW_PADDING * 2;
    const tab = resolveTab({
      containerHeight,
      centerY: containerHeight / 2,
      depth: settings.widthPx,
      height: settings.heightPx,
      cornerRadius: settings.cornerRadiusPx,
      mergeRadius: settings.mergeRadiusPx,
    });
    const outline = tabOutline(tab)
      .map(([u, y], index) => `${index === 0 ? 'M' : 'L'}${(PREVIEW_TRACK + u).toFixed(2)},${y.toFixed(2)}`)
      .join('');
    const minX = -PREVIEW_PADDING;
    const width = PREVIEW_TRACK + settings.widthPx + PREVIEW_PADDING * 2;
    return { outline, viewBox: `${minX} 0 ${width} ${containerHeight}`, containerHeight };
  }, [settings]);

  return (
    <svg
      viewBox={preview.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="h-20 w-full"
      aria-label="Magnet tab preview"
      role="img"
    >
      <line
        x1={PREVIEW_TRACK}
        x2={PREVIEW_TRACK}
        y1={0}
        y2={preview.containerHeight}
        stroke="rgb(255 255 255 / 0.2)"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`${preview.outline}Z`}
        fill="rgb(255 255 255 / 0.06)"
        stroke="var(--inspector-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
