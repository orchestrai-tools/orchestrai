import { useId, type CSSProperties } from 'react';
import { m, useTransform } from 'motion/react';
import type { EdgeSurfaceState } from '../../hooks/useEdgeSurface';
import type { BorderMode } from '../../lib/edgeSurface';
import { HIDDEN_GLYPH, placeInsetGlyph } from '../../lib/insetGlyph';
import type { InsetIconSettings, Side } from '../../settings/types';
import { InsetGlyph } from './InsetGlyph';

interface EdgeSurfaceProps {
  surface: EdgeSurfaceState;
  side: Side;
  collapsed: boolean;
  height: number;
  borderMode: BorderMode;
  /** The magnet tab's icon; null when the magnet is off or the icon is disabled. */
  inset: InsetIconSettings | null;
}

const MASK_OVERSCAN_PX = 1000;

/**
 * The edge as part of the sidebar: one surface whose content-facing outline
 * ripples and pulls out into the magnet tab, with the border drawn along it.
 */
export function EdgeSurface({ surface, side, collapsed, height, borderMode, inset }: EdgeSurfaceProps) {
  const maskId = useId();
  const pointsLeft = (side === 'left') !== collapsed;

  const glyph = useTransform(surface.tab, (tab) =>
    tab && inset
      ? placeInsetGlyph(tab, {
          shape: inset.shape,
          sizePx: inset.sizePx,
          pointsLeft,
          outward: side === 'left' ? 1 : -1,
          offsetXPx: inset.offsetXPx,
          offsetYPx: inset.offsetYPx,
        })
      : HIDDEN_GLYPH,
  );
  const glyphTransform = useTransform(glyph, (placement) => placement.transform);
  const glyphOpacity = useTransform(glyph, (placement) => placement.opacity);

  const cutThrough = inset?.cutThrough ?? false;
  const mask = cutThrough ? `url(#${maskId})` : undefined;

  return (
    <svg className="edge-surface" aria-hidden="true">
      {inset && cutThrough && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-MASK_OVERSCAN_PX}
            y={0}
            width={MASK_OVERSCAN_PX * 2}
            height={height}
          >
            <rect x={-MASK_OVERSCAN_PX} y={0} width={MASK_OVERSCAN_PX * 2} height={height} fill="white" />
            <InsetGlyph
              shape={inset.shape}
              transform={glyphTransform}
              opacity={glyphOpacity}
              className="edge-surface__glyph-mask"
            />
          </mask>
        </defs>
      )}

      <m.path className="edge-surface__gap" d={surface.gap} />
      <m.path className="edge-surface__body" d={surface.body} mask={mask} />
      <m.path className="edge-surface__border" data-mode={borderMode} d={surface.border} mask={mask} />

      {inset &&
        (cutThrough ? (
          <InsetGlyph
            shape={inset.shape}
            transform={glyphTransform}
            opacity={glyphOpacity}
            className="edge-surface__glyph-rim"
          />
        ) : (
          <g style={{ '--deboss-depth': inset.depthPercent / 100 } as CSSProperties}>
            <InsetGlyph
              shape={inset.shape}
              transform={glyphTransform}
              opacity={glyphOpacity}
              className="edge-surface__glyph-cavity"
            />
            <InsetGlyph
              shape={inset.shape}
              transform={glyphTransform}
              opacity={glyphOpacity}
              className="edge-surface__glyph-bevel"
            />
          </g>
        ))}
    </svg>
  );
}
