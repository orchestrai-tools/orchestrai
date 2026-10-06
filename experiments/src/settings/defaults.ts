import type { GridLayerSettings, Settings } from './types';

export const LAYOUT_LIMITS = {
  minWidthPx: 160,
  maxWidthPx: 480,
  maxAngleDeg: 8,
  maxCollapsedWidthPx: 72,
  keyboardStepPx: 16,
  keyboardLargeStepPx: 48,
} as const;

const DEFAULT_GRID_LAYER: GridLayerSettings = {
  enabled: true,
  symbol: 'dot',
  opacityPercent: 14,
  spacingPx: 20,
  sizePx: 2,
  relief: 'flat',
  reliefPx: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  palette: {
    hue: 222,
    harmony: 'monochrome',
    saturation: 18,
  },
  border: {
    widthPx: 10,
    hitTargetPx: 14,
    hidden: false,
    hoverOnly: true,
    useCustomColor: false,
    customColor: '#3b82f6',
    lineStyle: 'full',
    fadeInMs: 160,
    fadeOutMs: 450,
    easing: 'linear',
    glowBlurPx: 0,
    cursor: 'col-resize',
  },
  lightsaber: {
    enabled: false,
    crystalId: 'cyan',
  },
  badge: {
    enabled: true,
    glyph: 'arrows',
    shape: 'pill',
    sizePx: 26,
    offsetPx: 0,
    followPointer: true,
    positionPercent: 50,
  },
  magnet: {
    enabled: true,
    widthPx: 24,
    heightPx: 90,
    cornerRadiusPx: 8,
    mergeRadiusPx: 12,
    proximityPx: 70,
    inset: {
      enabled: true,
      shape: 'arrow',
      cutThrough: false,
      depthPercent: 60,
      sizePx: 16,
      offsetXPx: 0,
      offsetYPx: 0,
    },
  },
  ripple: {
    enabled: true,
    trigger: 'enter',
    amplitudePx: 5,
    wavelengthPx: 110,
    speedPxPerSec: 700,
    durationMs: 1600,
    reachPx: 360,
  },
  grid: {
    linked: true,
    pinned: true,
    left: DEFAULT_GRID_LAYER,
    main: DEFAULT_GRID_LAYER,
    right: DEFAULT_GRID_LAYER,
  },
  layout: {
    linked: true,
    collapsedWidthPx: 0,
    collapseDurationMs: 280,
    collapseEasing: 'fluid',
    left: { widthPx: 260, angleDeg: 0, collapsed: false },
    right: { widthPx: 260, angleDeg: 0, collapsed: false },
  },
};
