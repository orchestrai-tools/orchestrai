export const SIDEBAR_OPACITY_MIN = 0.6;
export const SIDEBAR_OPACITY_MAX = 1;
export const SIDEBAR_OPACITY_DEFAULT = 0.85;
export const BLUR_RADIUS_MIN = 1;
export const BLUR_RADIUS_MAX = 64;
export const BLUR_RADIUS_DEFAULT = 24;
export const MONO_FONT_MIN = 9;
export const MONO_FONT_MAX = 22;
export const MONO_FONT_DEFAULT = 13;

export function clampOpacity(value: number): number {
  return Math.min(SIDEBAR_OPACITY_MAX, Math.max(SIDEBAR_OPACITY_MIN, value));
}

export function clampBlur(value: number): number {
  return Math.min(BLUR_RADIUS_MAX, Math.max(BLUR_RADIUS_MIN, Math.round(value)));
}

export function clampMono(value: number): number {
  return Math.min(MONO_FONT_MAX, Math.max(MONO_FONT_MIN, Math.round(value)));
}
