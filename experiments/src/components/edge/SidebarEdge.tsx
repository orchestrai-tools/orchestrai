import { useCallback, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useMotionValue, useReducedMotion } from 'motion/react';
import { Separator } from 'react-resizable-panels';
import { useResizeObserver } from 'usehooks-ts';
import { edgeSkewDeg, type EdgeZone } from '../../lib/edgeGeometry';
import { borderMode } from '../../lib/edgeSurface';
import { useEdgePointer, type EdgePoint } from '../../hooks/useEdgePointer';
import { useEdgeSurface } from '../../hooks/useEdgeSurface';
import { borderBand } from '../../settings/presets';
import { useSettingsActions, useSettingsSlice, useSidebarSettings } from '../../settings/store';
import type { Side } from '../../settings/types';
import { EdgeBadge } from './EdgeBadge';
import { EdgeSurface } from './EdgeSurface';

/**
 * The separator between a sidebar and the content. Resizing and keyboard
 * behaviour come from react-resizable-panels; this component layers the
 * visual system (border line or live surface, badge) and click-to-collapse.
 */
export function SidebarEdge({ side }: { side: Side }) {
  const border = useSettingsSlice('border');
  const magnet = useSettingsSlice('magnet');
  const ripple = useSettingsSlice('ripple');
  const badge = useSettingsSlice('badge');
  const sidebar = useSidebarSettings(side);
  const { toggleCollapsed } = useSettingsActions();
  const reducedMotion = useReducedMotion() ?? false;

  const frameRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // usehooks-ts still types refs as non-nullable (pre-React 19 RefObject).
  const { height = 0 } = useResizeObserver({
    ref: frameRef as RefObject<HTMLDivElement>,
    box: 'border-box',
  });
  const pressed = useRef<{ widthPx: number; collapsed: boolean } | null>(null);

  const skewDeg = edgeSkewDeg(side, sidebar);
  const band = useMemo(() => borderBand(border.lineStyle, border.widthPx), [border.lineStyle, border.widthPx]);

  const zone = useMemo<EdgeZone>(
    () => ({
      side,
      trackWidth: border.widthPx,
      height,
      handlePadding: Math.max(0, (border.hitTargetPx - border.widthPx) / 2),
    }),
    [side, border.widthPx, border.hitTargetPx, height],
  );

  const localY = useMotionValue(0);
  const pull = useMotionValue(0);

  const surface = useEdgeSurface({
    side,
    trackWidth: border.widthPx,
    band,
    height,
    waves: {
      amplitudePx: ripple.amplitudePx,
      wavelengthPx: ripple.wavelengthPx,
      speedPxPerSec: ripple.speedPxPerSec,
      lifetimeMs: ripple.durationMs,
      reachPx: ripple.reachPx,
    },
    magnet: { enabled: magnet.enabled, settings: magnet, localY, pull },
  });

  const rippleActive = ripple.enabled && !reducedMotion;
  const { ripple: startWave } = surface;
  const startRipple = useCallback((point: EdgePoint) => startWave(point.y), [startWave]);

  const pointer = useEdgePointer({
    localY,
    pull,
    frameRef,
    surfaceRef,
    zone,
    skewDeg,
    attractRangePx: magnet.enabled ? magnet.proximityPx : 0,
    onWaterEnter: rippleActive ? startRipple : undefined,
    onWaterExit: rippleActive && ripple.trigger === 'enter-exit' ? startRipple : undefined,
  });

  const toggleIfUnmoved = () => {
    const start = pressed.current;
    pressed.current = null;
    if (start && start.widthPx === sidebar.widthPx && start.collapsed === sidebar.collapsed) {
      toggleCollapsed(side);
    }
  };

  return (
    <Separator
      id={`edge-${side}`}
      className="sidebar-edge"
      style={{ '--edge-skew': `${skewDeg}deg` } as CSSProperties}
      data-side={side}
      data-collapsed={sidebar.collapsed}
      data-pointer={pointer.overHandle ? 'over' : pointer.near ? 'near' : 'idle'}
      aria-label={`${side === 'left' ? 'Left' : 'Right'} sidebar edge. Drag or use arrow keys to resize, Enter to ${sidebar.collapsed ? 'expand' : 'collapse'}.`}
      disableDoubleClick
      onPointerDown={() => {
        pressed.current = { widthPx: sidebar.widthPx, collapsed: sidebar.collapsed };
      }}
      onClick={toggleIfUnmoved}
    >
      <div ref={frameRef} className="sidebar-edge__frame">
        <div ref={surfaceRef} className="sidebar-edge__surface">
          {ripple.enabled || magnet.enabled ? (
            <EdgeSurface
              surface={surface}
              side={side}
              collapsed={sidebar.collapsed}
              height={height}
              borderMode={borderMode(band, border.widthPx)}
              inset={magnet.enabled && magnet.inset.enabled ? magnet.inset : null}
            />
          ) : (
            <div className="sidebar-edge__line" />
          )}

          <div className="sidebar-edge__handle" />

          {badge.enabled && (
            <EdgeBadge
              side={side}
              collapsed={sidebar.collapsed}
              engaged={pointer.overHandle}
              settings={badge}
              localY={localY}
            />
          )}
        </div>
      </div>
    </Separator>
  );
}
