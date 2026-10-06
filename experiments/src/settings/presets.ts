import type { BadgeShape, EasingMode, LineStyle } from './types';

export interface LightsaberCrystal {
  id: string;
  name: string;
  color: string;
  core: string;
}

export const LIGHTSABER_CRYSTALS: readonly LightsaberCrystal[] = [
  { id: 'cyan', name: 'Skywalker', color: '#00f0ff', core: '#e6ffff' },
  { id: 'lime', name: 'Yoda', color: '#39ff14', core: '#eaffea' },
  { id: 'blue', name: 'Kenobi', color: '#0066ff', core: '#e6f0ff' },
  { id: 'violet', name: 'Windu', color: '#b026ff', core: '#f5e8ff' },
  { id: 'crimson', name: 'Sith', color: '#ff1744', core: '#ffe8ec' },
  { id: 'magenta', name: 'Mara', color: '#ff007f', core: '#ffe6f2' },
  { id: 'orange', name: 'Cal', color: '#ff6600', core: '#fff2e6' },
  { id: 'yellow', name: 'Temple', color: '#ffe600', core: '#fffde6' },
];

export function findCrystal(id: string): LightsaberCrystal {
  return LIGHTSABER_CRYSTALS.find((crystal) => crystal.id === id) ?? LIGHTSABER_CRYSTALS[0];
}

export const HUE_PRESETS: readonly { name: string; hue: number }[] = [
  { name: 'Slate Blue', hue: 222 },
  { name: 'Deep Indigo', hue: 245 },
  { name: 'Amethyst', hue: 280 },
  { name: 'Rose Quartz', hue: 345 },
  { name: 'Amber Bronze', hue: 35 },
  { name: 'Emerald', hue: 155 },
  { name: 'Cyber Teal', hue: 185 },
];

export const BORDER_COLOR_PRESETS: readonly { name: string; color: string }[] = [
  { name: 'Slate', color: '#1e2330' },
  { name: 'Gunmetal', color: '#2d3748' },
  { name: 'Charcoal', color: '#3f3f46' },
  { name: 'Steel', color: '#3b82f6' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'White', color: '#ffffff' },
];

export const EASING_CURVES: Record<EasingMode, string> = {
  linear: 'linear',
  fluid: 'cubic-bezier(0.16, 1, 0.3, 1)',
  gentle: 'cubic-bezier(0.4, 0, 0.2, 1)',
  snappy: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

export const EASING_OPTIONS: readonly { value: EasingMode; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'fluid', label: 'Fluid' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'snappy', label: 'Snappy' },
];

/** `widthPx: null` fills the whole track. */
export const LINE_STYLE_GEOMETRY: Record<LineStyle, { widthPx: number | null; radius: string }> = {
  full: { widthPx: null, radius: '0px' },
  'center-rail': { widthPx: 2, radius: '9999px' },
  'soft-glow': { widthPx: 4, radius: '9999px' },
};

export interface BorderBand {
  widthPx: number;
  /** Distance from the track's content-facing side to the band. */
  insetPx: number;
}

/** Where the border line sits across the track; the line is centred in it. */
export function borderBand(style: LineStyle, trackWidth: number): BorderBand {
  const widthPx = Math.min(trackWidth, LINE_STYLE_GEOMETRY[style].widthPx ?? trackWidth);
  return { widthPx, insetPx: (trackWidth - widthPx) / 2 };
}

export const BADGE_SHAPE_RADIUS: Record<BadgeShape, string> = {
  pill: '9999px',
  circle: '50%',
  square: '6px',
  minimal: '0px',
  none: '0px',
};
