export type Side = 'left' | 'right';

export type HarmonyMode = 'monochrome' | 'analogous' | 'complementary';
export type EasingMode = 'linear' | 'fluid' | 'gentle' | 'snappy';
export type LineStyle = 'full' | 'center-rail' | 'soft-glow';
export type EdgeCursor =
  | 'col-resize'
  | 'ew-resize'
  | 'grab'
  | 'pointer'
  | 'crosshair'
  | 'move'
  | 'default';
export type BadgeGlyph =
  | 'arrows'
  | 'chevrons'
  | 'grip'
  | 'dots'
  | 'split'
  | 'sparkle'
  | 'pin'
  | 'none';
export type BadgeShape = 'pill' | 'circle' | 'square' | 'minimal' | 'none';
export type InsetShape = 'arrow' | 'chevron' | 'notch' | 'circle' | 'grip' | 'diamond';
export type RippleTrigger = 'enter' | 'enter-exit';
export type GridRegion = 'left' | 'main' | 'right';
export type GridSymbol = 'dot' | 'ring' | 'plus' | 'cross' | 'square' | 'diamond';
export type GridRelief = 'flat' | 'raised' | 'inset';

export interface PaletteSettings {
  hue: number;
  harmony: HarmonyMode;
  saturation: number;
}

export interface BorderSettings {
  widthPx: number;
  hitTargetPx: number;
  hidden: boolean;
  hoverOnly: boolean;
  useCustomColor: boolean;
  customColor: string;
  lineStyle: LineStyle;
  fadeInMs: number;
  fadeOutMs: number;
  easing: EasingMode;
  glowBlurPx: number;
  cursor: EdgeCursor;
}

export interface LightsaberSettings {
  enabled: boolean;
  crystalId: string;
}

export interface BadgeSettings {
  enabled: boolean;
  glyph: BadgeGlyph;
  shape: BadgeShape;
  sizePx: number;
  offsetPx: number;
  followPointer: boolean;
  positionPercent: number;
}

export interface InsetIconSettings {
  enabled: boolean;
  shape: InsetShape;
  cutThrough: boolean;
  depthPercent: number;
  sizePx: number;
  /** Positive moves toward the content on either side. */
  offsetXPx: number;
  /** Positive moves down. */
  offsetYPx: number;
}

export interface MagnetSettings {
  enabled: boolean;
  widthPx: number;
  heightPx: number;
  cornerRadiusPx: number;
  mergeRadiusPx: number;
  proximityPx: number;
  inset: InsetIconSettings;
}

export interface RippleSettings {
  enabled: boolean;
  trigger: RippleTrigger;
  /** Peak displacement of the edge contour. */
  amplitudePx: number;
  wavelengthPx: number;
  speedPxPerSec: number;
  /** Time for a wave to die down. */
  durationMs: number;
  /** Distance along the edge over which a wave fades out. */
  reachPx: number;
}

export interface GridLayerSettings {
  enabled: boolean;
  symbol: GridSymbol;
  /** How strongly the symbols show against the surface. */
  opacityPercent: number;
  spacingPx: number;
  sizePx: number;
  relief: GridRelief;
  /** Offset of the light and dark edges that make a symbol look raised or inset. */
  reliefPx: number;
}

export interface GridSettings {
  /** Every region shares one look; edits apply to all three. */
  linked: boolean;
  /** Symbols stay fixed to the window instead of moving with each panel when sidebars resize. */
  pinned: boolean;
  left: GridLayerSettings;
  main: GridLayerSettings;
  right: GridLayerSettings;
}

export interface SidebarSettings {
  widthPx: number;
  /** Positive leans the edge toward the content at the top ("out"), negative leans it in. */
  angleDeg: number;
  collapsed: boolean;
}

export interface LayoutSettings {
  linked: boolean;
  collapsedWidthPx: number;
  collapseDurationMs: number;
  collapseEasing: EasingMode;
  left: SidebarSettings;
  right: SidebarSettings;
}

export interface Settings {
  palette: PaletteSettings;
  border: BorderSettings;
  lightsaber: LightsaberSettings;
  badge: BadgeSettings;
  magnet: MagnetSettings;
  ripple: RippleSettings;
  grid: GridSettings;
  layout: LayoutSettings;
}

export type SettingsSlice = keyof Settings;
