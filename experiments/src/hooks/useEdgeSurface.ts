import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { cancelFrame, frame } from 'motion';
import {
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'motion/react';
import { buildEdgeSurface, type SurfacePaths } from '../lib/edgeSurface';
import type { TabGlyphFrame } from '../lib/insetGlyph';
import { resolveTab } from '../lib/tabProfile';
import { addRipple, pruneRipples, surfaceDisplacement, type SurfaceRipple, type WaveParams } from '../lib/waterSurface';
import type { BorderBand } from '../settings/presets';
import type { MagnetSettings, Side } from '../settings/types';

interface EdgeSurfaceOptions {
  side: Side;
  trackWidth: number;
  band: BorderBand;
  height: number;
  waves: WaveParams;
  magnet: {
    enabled: boolean;
    settings: MagnetSettings;
    localY: MotionValue<number>;
    pull: MotionValue<number>;
  };
}

export interface EdgeSurfaceState {
  gap: MotionValue<string>;
  body: MotionValue<string>;
  border: MotionValue<string>;
  /** Null while the tab is retracted. */
  tab: MotionValue<TabGlyphFrame | null>;
  ripple: (originY: number) => void;
}

interface WaveState {
  nowMs: number;
  ripples: readonly SurfaceRipple[];
}

const MAGNET_SPRING: SpringOptions = { stiffness: 420, damping: 32, mass: 0.6 };
const RESTING_PULL = 0.01;
/** Sample spacing along straight runs while a wave is moving; a still run needs only its ends. */
const WAVE_STEP_PX = 4;
const STILL = () => 0;

/**
 * Drives the edge surface. Magnet springs and a wave clock are motion values
 * read by one computed value, so the outline is rebuilt at most once per
 * frame and only while the tab or a wave is moving, without React renders.
 */
export function useEdgeSurface({ side, trackWidth, band, height, waves, magnet }: EdgeSurfaceOptions): EdgeSurfaceState {
  const pull = useSpring(magnet.pull, MAGNET_SPRING);
  const centerY = useSpring(magnet.localY, MAGNET_SPRING);
  const waveState = useMotionValue<WaveState>({ nowMs: 0, ripples: [] });
  const tickRef = useRef<(() => void) | null>(null);

  // Appear where the pointer is instead of sliding in from the last position.
  useMotionValueEvent(magnet.localY, 'change', (y) => {
    if (pull.get() < RESTING_PULL) centerY.jump(y);
  });

  const geometry = useTransform((): SurfacePaths & { tab: TabGlyphFrame | null } => {
    const { nowMs, ripples } = waveState.get();
    const moving = ripples.length > 0;
    const displacement = moving ? (y: number) => surfaceDisplacement(y, nowMs, ripples, waves) : STILL;
    const extension = magnet.enabled ? pull.get() : 0;
    const settings = magnet.settings;
    const tab =
      extension >= RESTING_PULL
        ? resolveTab({
            containerHeight: height,
            centerY: centerY.get(),
            depth: settings.widthPx * extension,
            height: settings.heightPx,
            cornerRadius: settings.cornerRadiusPx,
            mergeRadius: settings.mergeRadiusPx,
          })
        : null;

    const paths = buildEdgeSurface(
      { side, trackWidth, height, band, maxAmplitude: waves.amplitudePx },
      displacement,
      moving ? WAVE_STEP_PX : Number.POSITIVE_INFINITY,
      tab,
    );

    const outward = side === 'left' ? 1 : -1;
    const contentX = side === 'left' ? trackWidth : 0;
    return {
      ...paths,
      tab: tab && {
        iconCenter: {
          x: contentX + outward * (tab.depth * 0.45 + displacement(tab.centerY)),
          y: tab.centerY,
        },
        height: tab.half * 2,
        depth: tab.depth,
      },
    };
  });

  const advance = useEffectEvent((): boolean => {
    const nowMs = performance.now();
    const ripples = pruneRipples(waveState.get().ripples, nowMs, waves);
    waveState.set({ nowMs, ripples });
    return ripples.length > 0;
  });

  useEffect(() => {
    const tick = () => {
      if (!advance()) cancelFrame(tick);
    };
    tickRef.current = tick;
    return () => {
      cancelFrame(tick);
      tickRef.current = null;
    };
  }, []);

  const ripple = useCallback(
    (originY: number) => {
      const nowMs = performance.now();
      waveState.set({ nowMs, ripples: addRipple(waveState.get().ripples, originY, nowMs) });
      if (tickRef.current) frame.update(tickRef.current, true);
    },
    [waveState],
  );

  const gap = useTransform(geometry, (g) => g.gap);
  const body = useTransform(geometry, (g) => g.body);
  const border = useTransform(geometry, (g) => g.border);
  const tab = useTransform(geometry, (g) => g.tab);
  return { gap, body, border, tab, ripple };
}
