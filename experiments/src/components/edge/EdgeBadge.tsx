import { useEffect, type CSSProperties } from 'react';
import {
  ChevronsRight,
  Columns2,
  GripVertical,
  MoreVertical,
  Pin,
  Play,
  Sparkles,
} from 'lucide-react';
import { m, useSpring, type MotionValue, type SpringOptions } from 'motion/react';
import type { BadgeGlyph, BadgeSettings, Side } from '../../settings/types';

interface EdgeBadgeProps {
  side: Side;
  collapsed: boolean;
  engaged: boolean;
  settings: BadgeSettings;
  localY: MotionValue<number>;
}

const GLYPH_SCALE = 0.55;
const MIN_GLYPH_PX = 10;
const FOLLOW_SPRING: SpringOptions = { stiffness: 520, damping: 40, mass: 0.5 };

/**
 * The anchor moves with a composited translateY (never `top`, which would
 * trigger layout each frame); the badge inside keeps its CSS offset/skew.
 */
export function EdgeBadge({ side, collapsed, engaged, settings, localY }: EdgeBadgeProps) {
  const ySpring = useSpring(localY, FOLLOW_SPRING);

  useEffect(() => {
    // Snap to the pointer as the badge appears so it never slides in from a stale spot.
    if (engaged) ySpring.jump(localY.get());
  }, [engaged, localY, ySpring]);

  if (settings.glyph === 'none') return null;

  const glyphSize = Math.max(MIN_GLYPH_PX, Math.round(settings.sizePx * GLYPH_SCALE));
  // Expanded: the arrow points into the sidebar (the action is "close"). Collapsed: it points out.
  const pointsLeft = (side === 'left') !== collapsed;
  const anchorStyle = settings.followPointer
    ? { top: 0, y: ySpring }
    : { top: `${settings.positionPercent}%`, y: 0 };

  return (
    <m.div className="edge-badge-anchor" style={anchorStyle} aria-hidden="true">
      <div className="edge-badge">
        <BadgeGlyphIcon glyph={settings.glyph} size={glyphSize} pointsLeft={pointsLeft} />
      </div>
    </m.div>
  );
}

function BadgeGlyphIcon({
  glyph,
  size,
  pointsLeft,
}: {
  glyph: Exclude<BadgeGlyph, 'none'>;
  size: number;
  pointsLeft: boolean;
}) {
  const style: CSSProperties = { width: size, height: size };
  const directional: CSSProperties = { ...style, transform: pointsLeft ? 'scaleX(-1)' : undefined };

  switch (glyph) {
    case 'arrows':
      return <Play style={directional} fill="currentColor" />;
    case 'chevrons':
      return <ChevronsRight style={directional} />;
    case 'grip':
      return <GripVertical style={style} />;
    case 'dots':
      return <MoreVertical style={style} />;
    case 'split':
      return <Columns2 style={style} />;
    case 'sparkle':
      return <Sparkles style={style} />;
    case 'pin':
      return <Pin style={style} />;
  }
}
