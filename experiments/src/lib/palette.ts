import { clampChroma, converter, formatCss, type Oklch } from 'culori';
import type { PaletteSettings } from '../settings/types';

export interface ThemePalette {
  bgMain: string;
  bgSidebarLeft: string;
  bgSidebarRight: string;
  border: string;
  borderHover: string;
  glow: string;
  accent: string;
  /** Light, faintly tinted neutral for background patterns. */
  gridInk: string;
}

const toOklch = converter('oklch');

/**
 * Perceptual lightness and chroma per role, in OKLCH. Lightness is constant
 * across hues (unlike HSL, where yellow reads far brighter than blue at the
 * same "lightness"); chroma scales with the saturation setting.
 */
const ROLES = {
  bgMain: { l: 0.165, chromaPerSaturation: 0.048, saturationShift: 0 },
  sidebar: { l: 0.208, chromaPerSaturation: 0.075, saturationShift: -2 },
  border: { l: 0.267, chromaPerSaturation: 0.113, saturationShift: 2 },
  borderHover: { l: 0.422, chromaPerSaturation: 0.224, saturationShift: 30 },
  glow: { l: 0.62, chromaPerSaturation: 0.2, saturationShift: 40 },
  gridInk: { l: 0.88, chromaPerSaturation: 0.04, saturationShift: 0 },
} as const;
const ACCENT = { l: 0.68, c: 0.16 };
const GLOW_ALPHA = 0.45;
const MAX_SATURATION = 95;

/** The hue slider speaks HSL degrees (its track is an HSL rainbow); map that to an OKLCH hue. */
function oklchHueFromHsl(hslHue: number): number {
  return toOklch({ mode: 'hsl', h: hslHue, s: 1, l: 0.5 })?.h ?? 0;
}

function tone(
  hslHue: number,
  role: (typeof ROLES)[keyof typeof ROLES],
  saturation: number,
  alpha?: number,
): string {
  const effective = Math.min(MAX_SATURATION, Math.max(0, saturation + role.saturationShift)) / 100;
  const color: Oklch = {
    mode: 'oklch',
    l: role.l,
    c: effective * role.chromaPerSaturation,
    h: oklchHueFromHsl(hslHue),
    alpha,
  };
  return formatCss(clampChroma(color, 'oklch'));
}

export function computePalette({ hue, harmony, saturation }: PaletteSettings): ThemePalette {
  let leftHue = hue;
  let rightHue = hue;
  let borderHue = hue;

  if (harmony === 'analogous') {
    leftHue = hue - 15;
    rightHue = hue + 15;
    borderHue = hue + 8;
  } else if (harmony === 'complementary') {
    borderHue = hue + 180;
  }

  return {
    bgMain: tone(hue, ROLES.bgMain, saturation),
    bgSidebarLeft: tone(leftHue, ROLES.sidebar, saturation),
    bgSidebarRight: tone(rightHue, ROLES.sidebar, saturation),
    border: tone(borderHue, ROLES.border, saturation),
    borderHover: tone(borderHue, ROLES.borderHover, saturation),
    glow: tone(borderHue, ROLES.glow, saturation, GLOW_ALPHA),
    gridInk: tone(hue, ROLES.gridInk, saturation),
    accent: formatCss(
      clampChroma({ mode: 'oklch', ...ACCENT, h: oklchHueFromHsl(hue) }, 'oklch'),
    ),
  };
}
