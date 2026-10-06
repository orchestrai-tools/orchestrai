/**
 * Waves on the sidebar edge. Each entry starts a damped wave that travels up
 * and down the edge from the entry point; the surface is displaced by the sum
 * of all live waves.
 */
export interface SurfaceRipple {
  originY: number;
  startMs: number;
}

export interface WaveParams {
  amplitudePx: number;
  wavelengthPx: number;
  speedPxPerSec: number;
  lifetimeMs: number;
  reachPx: number;
}

const TAU = Math.PI * 2;
const MAX_RIPPLES = 6;
/** Most of a wave has decayed (e^-3 ≈ 5%) by the end of its lifetime. */
const DECAY_PER_LIFETIME = 3;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function addRipple(ripples: readonly SurfaceRipple[], originY: number, nowMs: number) {
  return [...ripples.slice(-(MAX_RIPPLES - 1)), { originY, startMs: nowMs }];
}

export function pruneRipples(ripples: readonly SurfaceRipple[], nowMs: number, params: WaveParams) {
  return ripples.filter((ripple) => nowMs - ripple.startMs < params.lifetimeMs);
}

/**
 * Displacement of the surface at `y`; positive bulges toward the content.
 * The wave dips inward first (something entered the water), its front is
 * tapered so the surface stays continuous, and it fades over time and distance.
 */
export function surfaceDisplacement(
  y: number,
  nowMs: number,
  ripples: readonly SurfaceRipple[],
  params: WaveParams,
): number {
  const decaySec = params.lifetimeMs / 1000 / DECAY_PER_LIFETIME;
  let total = 0;
  for (const ripple of ripples) {
    const ageSec = (nowMs - ripple.startMs) / 1000;
    if (ageSec <= 0) continue;
    const distance = Math.abs(y - ripple.originY);
    const behindFront = params.speedPxPerSec * ageSec - distance;
    if (behindFront <= 0) continue;
    total -=
      params.amplitudePx *
      Math.sin((TAU * behindFront) / params.wavelengthPx) *
      Math.exp(-ageSec / decaySec) *
      Math.exp(-distance / params.reachPx) *
      smoothstep(0, params.wavelengthPx / 2, behindFront);
  }
  return total;
}
