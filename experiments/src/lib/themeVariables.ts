import type { CSSProperties } from 'react';
import {
  BADGE_SHAPE_RADIUS,
  EASING_CURVES,
  LINE_STYLE_GEOMETRY,
  findCrystal,
} from '../settings/presets';
import type {
  BadgeSettings,
  BorderSettings,
  GridRegion,
  GridSettings,
  LayoutSettings,
  LightsaberSettings,
} from '../settings/types';
import { buildGridTile } from './gridPattern';
import type { ThemePalette } from './palette';

export interface ThemeInputs {
  palette: ThemePalette;
  border: BorderSettings;
  lightsaber: LightsaberSettings;
  badge: BadgeSettings;
  grid: GridSettings;
  layout: Pick<LayoutSettings, 'collapsedWidthPx' | 'collapseDurationMs' | 'collapseEasing'>;
}

function gridVariables(grid: GridSettings, palette: ThemePalette): Record<`--${string}`, string> {
  const surfaces: Record<GridRegion, string> = {
    left: palette.bgSidebarLeft,
    main: palette.bgMain,
    right: palette.bgSidebarRight,
  };
  const variables: Record<`--${string}`, string> = {
    '--grid-attachment': grid.pinned ? 'fixed' : 'scroll',
  };
  for (const region of ['left', 'main', 'right'] as const) {
    const tile = buildGridTile(grid[region], { surface: surfaces[region], ink: palette.gridInk });
    variables[`--grid-${region}-image`] = tile?.image ?? 'none';
    variables[`--grid-${region}-size`] = tile?.size ?? 'auto';
  }
  return variables;
}

/**
 * Maps settings to the custom properties the stylesheets consume. Every value
 * the CSS reads at runtime is set here; static tokens live in tokens.css.
 * Takes only the slices it reads so sidebar width changes never rebuild it.
 */
export function buildThemeVariables({
  palette,
  border,
  lightsaber,
  badge,
  grid,
  layout,
}: ThemeInputs): CSSProperties {
  const crystal = findCrystal(lightsaber.crystalId);
  const saber = lightsaber.enabled;
  const line = LINE_STYLE_GEOMETRY[border.lineStyle];
  const badgeHasChrome = badge.shape !== 'minimal' && badge.shape !== 'none';
  const highlight = saber ? crystal.color : palette.accent;
  const borderColor = border.useCustomColor ? border.customColor : palette.border;
  const borderHover = border.useCustomColor ? border.customColor : palette.borderHover;

  const variables: Record<`--${string}`, string> = {
    '--bg-main': palette.bgMain,
    '--bg-sidebar-left': palette.bgSidebarLeft,
    '--bg-sidebar-right': palette.bgSidebarRight,
    '--accent': palette.accent,

    '--border-width': `${border.widthPx}px`,
    '--border-color': borderColor,
    '--border-hover-color': borderHover,
    '--border-fadein-duration': `${border.fadeInMs}ms`,
    '--border-fadeout-duration': `${border.fadeOutMs}ms`,
    '--border-easing': EASING_CURVES[border.easing],
    '--border-glow-blur': `${border.glowBlurPx}px`,
    '--border-glow-color': palette.glow,
    // A zero-blur drop-shadow is invisible but still costs a filter pass per frame on the rippling border.
    '--border-glow-filter':
      border.glowBlurPx > 0 ? `drop-shadow(0 0 ${border.glowBlurPx}px ${palette.glow})` : 'none',
    '--border-line-width': line.widthPx === null ? '100%' : `${line.widthPx}px`,
    '--border-line-radius': line.radius,
    '--edge-cursor': border.cursor,
    '--edge-hit-width': `${border.hitTargetPx}px`,

    '--saber-color': crystal.color,
    '--saber-core-color': crystal.core,
    '--saber-shadow': `0 0 3px ${crystal.core}, 0 0 8px ${crystal.color}, 0 0 20px ${crystal.color}, 0 0 38px ${crystal.color}`,

    '--edge-badge-size': `${badge.sizePx}px`,
    '--edge-badge-offset': `${badge.offsetPx}px`,
    '--edge-badge-radius': BADGE_SHAPE_RADIUS[badge.shape],
    '--edge-badge-color': highlight,
    '--edge-badge-bg': badgeHasChrome ? 'hsl(222 28% 10%)' : 'transparent',
    '--edge-badge-border': badgeHasChrome ? (saber ? crystal.color : 'hsl(222 20% 25%)') : 'transparent',
    '--edge-badge-shadow': badgeHasChrome
      ? saber
        ? `0 0 10px ${crystal.color}`
        : '0 4px 12px rgb(0 0 0 / 0.45)'
      : 'none',
    '--sidebar-collapsed-width': `${layout.collapsedWidthPx}px`,
    '--collapse-duration': `${layout.collapseDurationMs}ms`,
    '--collapse-easing': EASING_CURVES[layout.collapseEasing],

    ...gridVariables(grid, palette),
  };

  // React's CSSProperties has no index signature for custom properties.
  return variables as CSSProperties;
}
