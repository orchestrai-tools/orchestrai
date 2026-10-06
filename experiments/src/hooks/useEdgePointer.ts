import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { clamp } from 'es-toolkit';
import { cancelFrame, frame } from 'motion';
import type { MotionValue } from 'motion/react';
import {
  frameToSurface,
  magneticPull,
  maxReachPx,
  readSurfaceMatrix,
  sampleEdge,
  skewMatrix,
  type EdgeZone,
} from '../lib/edgeGeometry';

export interface EdgePoint {
  x: number;
  y: number;
}

export interface EdgePointer {
  overHandle: boolean;
  /** Close enough that the magnet is pulling. */
  near: boolean;
  inWater: boolean;
}

interface EdgePointerOptions {
  /** Continuous outputs are motion values so pointer movement never re-renders React. */
  localY: MotionValue<number>;
  pull: MotionValue<number>;
  frameRef: RefObject<HTMLElement | null>;
  surfaceRef: RefObject<HTMLElement | null>;
  zone: EdgeZone;
  skewDeg: number;
  attractRangePx: number;
  onWaterEnter?: (point: EdgePoint) => void;
  onWaterExit?: (point: EdgePoint) => void;
}

interface Flags {
  overHandle: boolean;
  near: boolean;
  inWater: boolean;
}

const RESTING: Flags = { overHandle: false, near: false, inWater: false };
const NEAR_PULL = 0.02;

/**
 * Tracks the pointer relative to one edge. Moves are coalesced into Motion's
 * read phase (one measurement per frame, batched with every other read), far
 * pointers are rejected before any matrix work, and the surface transform is
 * only re-read from the DOM while its skew is transitioning.
 */
export function useEdgePointer({
  localY,
  pull,
  frameRef,
  surfaceRef,
  zone,
  skewDeg,
  attractRangePx,
  onWaterEnter,
  onWaterExit,
}: EdgePointerOptions): EdgePointer {
  const [flags, setFlags] = useState<Flags>(RESTING);
  const skewTransitioning = useRef(false);

  const commitFlags = (next: Flags) =>
    setFlags((prev) =>
      prev.overHandle === next.overHandle && prev.near === next.near && prev.inWater === next.inWater
        ? prev
        : next,
    );

  const measure = useEffectEvent((clientX: number, clientY: number, wasInWater: boolean): boolean => {
    const frameEl = frameRef.current;
    const surface = surfaceRef.current;
    if (!frameEl || !surface) return wasInWater;

    const rect = frameEl.getBoundingClientRect();
    const reach = maxReachPx(zone, attractRangePx, skewDeg);
    const farAway =
      Math.abs(clientX - (rect.left + rect.width / 2)) > reach ||
      clientY < rect.top - reach ||
      clientY > rect.bottom + reach;
    if (farAway) {
      if (wasInWater) onWaterExit?.({ x: 0, y: localY.get() });
      pull.set(0);
      commitFlags(RESTING);
      return false;
    }

    const matrix = skewTransitioning.current ? readSurfaceMatrix(surface) : skewMatrix(skewDeg);
    const local = frameToSurface(matrix, rect.width, rect.height).transformPoint(
      new DOMPoint(clientX - rect.left, clientY - rect.top),
    );
    const sample = sampleEdge(local, zone);
    const y = clamp(sample.localY, 0, zone.height);

    if (sample.inWater !== wasInWater) {
      (sample.inWater ? onWaterEnter : onWaterExit)?.({ x: sample.localX, y });
    }

    const nextPull = magneticPull(sample, attractRangePx);
    if (nextPull > 0 || sample.overHandle || sample.inWater) localY.set(y);
    pull.set(nextPull);
    commitFlags({ overHandle: sample.overHandle, near: nextPull >= NEAR_PULL, inWater: sample.inWater });
    return sample.inWater;
  });

  const release = useEffectEvent(() => {
    pull.set(0);
    commitFlags(RESTING);
  });

  useEffect(() => {
    let latest: { x: number; y: number } | null = null;
    let inWater = false;

    const process = () => {
      if (!latest) return;
      const { x, y } = latest;
      latest = null;
      inWater = measure(x, y, inWater);
    };

    const onMove = (event: PointerEvent) => {
      latest = { x: event.clientX, y: event.clientY };
      frame.read(process);
    };

    const onLeave = () => {
      latest = null;
      inWater = false;
      cancelFrame(process);
      release();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelFrame(process);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onRun = (event: TransitionEvent) => {
      if (event.target === surface && event.propertyName === 'transform') skewTransitioning.current = true;
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === surface && event.propertyName === 'transform') skewTransitioning.current = false;
    };
    surface.addEventListener('transitionrun', onRun);
    surface.addEventListener('transitionend', onEnd);
    surface.addEventListener('transitioncancel', onEnd);
    return () => {
      surface.removeEventListener('transitionrun', onRun);
      surface.removeEventListener('transitionend', onEnd);
      surface.removeEventListener('transitioncancel', onEnd);
    };
  }, [surfaceRef]);

  return flags;
}
