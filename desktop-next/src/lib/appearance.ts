import { THEMES, type Theme } from "@warpforge/core/themes";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { APP_ICON_DEFAULT, isAppIcon, type AppIconId } from "./app-icon";
import {
  BLUR_RADIUS_DEFAULT,
  MONO_FONT_DEFAULT,
  SIDEBAR_OPACITY_DEFAULT,
  clampBlur,
  clampMono,
  clampOpacity,
} from "./appearance-values";
import { readWarpforgePrefs, upgradeWarpforgeStore } from "./migrate-warpforge";
import { useShell } from "./shell-store";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from "./sidebar-width";

interface AppearanceState {
  themeId: string;
  density: "comfortable" | "compact";
  radius: "none" | "default" | "round";
  glass: boolean;
  fontSize: number;
  monoFontSize: number;
  transparentWindow: boolean;
  sidebarOpacity: number;
  blurRadius: number;
  bodyGlass: boolean;
  theoMod: boolean;
  sidebarWidth: number;
  appIcon: AppIconId;
  migrated: boolean;
  setTheme: (id: string) => void;
  setDensity: (density: AppearanceState["density"]) => void;
  setRadius: (radius: AppearanceState["radius"]) => void;
  setGlass: (glass: boolean) => void;
  setFontSize: (fontSize: number) => void;
  setMonoFontSize: (monoFontSize: number) => void;
  bumpText: (delta: number) => void;
  resetText: () => void;
  setTransparentWindow: (transparentWindow: boolean) => void;
  setSidebarOpacity: (sidebarOpacity: number) => void;
  setBlurRadius: (blurRadius: number) => void;
  setBodyGlass: (bodyGlass: boolean) => void;
  setTheoMod: (theoMod: boolean) => void;
  setSidebarWidth: (sidebarWidth: number) => void;
  setAppIcon: (appIcon: string) => void;
  markMigrated: () => void;
}

/** The kit sizes text in rem against this root, so `text-sm` lands on 14px by default. */
export const FONT_DEFAULT = 16;
export const FONT_MIN = 14;
export const FONT_MAX = 22;
const clampFont = (size: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, size));

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      themeId: "neutral-light",
      density: "comfortable",
      radius: "default",
      glass: false,
      fontSize: FONT_DEFAULT,
      monoFontSize: MONO_FONT_DEFAULT,
      transparentWindow: false,
      sidebarOpacity: SIDEBAR_OPACITY_DEFAULT,
      blurRadius: BLUR_RADIUS_DEFAULT,
      bodyGlass: true,
      theoMod: false,
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      appIcon: APP_ICON_DEFAULT,
      migrated: false,
      setTheme: (themeId) => set({ themeId }),
      setDensity: (density) => set({ density }),
      setRadius: (radius) => set({ radius }),
      setGlass: (glass) => set({ glass }),
      setFontSize: (fontSize) => set({ fontSize: clampFont(fontSize) }),
      setMonoFontSize: (monoFontSize) => set({ monoFontSize: clampMono(monoFontSize) }),
      bumpText: (delta) =>
        set((state) => ({
          fontSize: clampFont(state.fontSize + delta),
          monoFontSize: clampMono(state.monoFontSize + delta),
        })),
      resetText: () => set({ fontSize: FONT_DEFAULT, monoFontSize: MONO_FONT_DEFAULT }),
      setTransparentWindow: (transparentWindow) => set({ transparentWindow }),
      setSidebarOpacity: (sidebarOpacity) => set({ sidebarOpacity: clampOpacity(sidebarOpacity) }),
      setBlurRadius: (blurRadius) => set({ blurRadius: clampBlur(blurRadius) }),
      setBodyGlass: (bodyGlass) => set({ bodyGlass }),
      setTheoMod: (theoMod) => set({ theoMod }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: clampSidebarWidth(sidebarWidth) }),
      setAppIcon: (appIcon) => set({ appIcon: isAppIcon(appIcon) ? appIcon : APP_ICON_DEFAULT }),
      markMigrated: () => set({ migrated: true }),
    }),
    {
      name: "orc-layout",
      version: 3,
      migrate: (persisted, version) => {
        let state = persisted as Partial<AppearanceState>;
        // Version 1 sized the root to the body text; the kit's body text is 2px under the root.
        if (version < 2 && typeof state.fontSize === "number")
          state = { ...state, fontSize: clampFont(state.fontSize + 2) };
        // Before version 3 the width was stored but never applied, so it holds no choice.
        if (version < 3) state = { ...state, sidebarWidth: SIDEBAR_WIDTH_DEFAULT };
        return state as AppearanceState;
      },
    },
  ),
);

/** The UI kit's own palette from `@warpforge/ui/styles.css`; it writes no colour overrides. */
export const NEUTRAL_THEMES = [
  { id: "neutral-light", name: "Neutral light", mode: "light" },
  { id: "neutral-dark", name: "Neutral dark", mode: "dark" },
] as const;

export type AppTheme = Theme | (typeof NEUTRAL_THEMES)[number];

export function themeChoices(): AppTheme[] {
  return [...NEUTRAL_THEMES, ...THEMES];
}

export function activeTheme(id: string): AppTheme {
  return themeChoices().find((theme) => theme.id === id) ?? NEUTRAL_THEMES[0];
}

/** One radius token that every component reads; things that touch stay square. */
const RADIUS: Record<string, string> = { none: "0rem", default: "0.25rem", round: "0.625rem" };

const SIDEBAR_TOKENS: Record<string, keyof Theme["colors"]> = {
  sidebar: "card",
  "sidebar-foreground": "foreground",
  "sidebar-primary": "primary",
  "sidebar-primary-foreground": "primary-foreground",
  "sidebar-accent": "accent",
  "sidebar-accent-foreground": "accent-foreground",
  "sidebar-border": "border",
  "sidebar-ring": "ring",
};

/** Shared themes are bare HSL triplets; the UI kit reads full colours. */
function themeProperties(theme: AppTheme): [string, string][] {
  if (!("colors" in theme)) return [];
  const colors = theme.colors as unknown as Record<string, string>;
  const own = Object.entries(colors).map(([key, value]): [string, string] => [
    key,
    `hsl(${value})`,
  ]);
  const sidebar = Object.entries(SIDEBAR_TOKENS).map(([key, from]): [string, string] => [
    key,
    `hsl(${colors[from]})`,
  ]);
  return [...own, ...sidebar];
}

const THEMED_KEYS = new Set(
  THEMES.flatMap((theme) => Object.keys(theme.colors)).concat(Object.keys(SIDEBAR_TOKENS)),
);

export function applyAppearance(
  theme: AppTheme,
  density: string,
  radius: string,
  fontSize = FONT_DEFAULT,
  monoFontSize = MONO_FONT_DEFAULT,
  options?: { opacity: number; bodyGlass: boolean; transparent: boolean; theo: boolean },
) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme.mode === "dark");
  root.dataset.theme = theme.id;
  root.dataset.density = density;
  root.dataset.radius = radius;
  root.style.setProperty("--radius", RADIUS[radius] ?? RADIUS.default);
  root.style.fontSize = `${fontSize}px`;
  root.style.setProperty("--mono-size", `${monoFontSize}px`);
  if (options) {
    root.style.setProperty("--sidebar-opacity", String(options.opacity));
    root.classList.toggle("glass-body", options.bodyGlass);
    root.classList.toggle("native-glass", options.transparent);
    root.classList.toggle("theo", options.theo);
  }
  for (const key of THEMED_KEYS) root.style.removeProperty(`--${key}`);
  for (const [key, value] of themeProperties(theme)) root.style.setProperty(`--${key}`, value);
}

/** Copy the settings a person already chose in the old app, once. */
export function migrateFromWarpforge() {
  const appearance = useAppearance.getState();
  if (appearance.migrated) return;
  appearance.markMigrated();
  const raw = localStorage.getItem("wf-ui");
  if (!raw) return;
  try {
    const state = upgradeWarpforgeStore(JSON.parse(raw));
    if (typeof state.theme === "string") appearance.setTheme(state.theme);
    if (typeof state.fontSize === "number") appearance.setFontSize(state.fontSize + 2);
    if (typeof state.monoFontSize === "number") appearance.setMonoFontSize(state.monoFontSize);
    if (typeof state.transparentWindow === "boolean")
      appearance.setTransparentWindow(state.transparentWindow);
    if (typeof state.sidebarOpacity === "number")
      appearance.setSidebarOpacity(state.sidebarOpacity);
    if (typeof state.blurRadius === "number") appearance.setBlurRadius(state.blurRadius);
    if (typeof state.bodyGlass === "boolean") appearance.setBodyGlass(state.bodyGlass);
    if (typeof state.theoMod === "boolean") appearance.setTheoMod(state.theoMod);
    if (typeof state.selectedProjectId === "string") {
      useShell.getState().openProject(state.selectedProjectId);
    }
    if (Array.isArray(state.pinnedTaskIds)) {
      const pinned = state.pinnedTaskIds.filter((id): id is string => typeof id === "string");
      useShell.setState({ pinned });
    }
    if (typeof state.newTaskWorktree === "boolean") {
      useShell.setState({ newTaskWorktree: state.newTaskWorktree });
    }
    if (state.pinnedLayout && typeof state.pinnedLayout === "object") {
      useShell.setState({
        pinnedLayout: state.pinnedLayout as Record<
          string,
          { x: number; y: number; w: number; h: number }
        >,
      });
    }
    const prefs = readWarpforgePrefs(state);
    const shell = useShell.getState();
    useShell.setState({
      ...prefs,
      pages: { ...shell.pages, ...prefs.pages },
      changesPane: { ...shell.changesPane, ...prefs.changesPane },
      backlogByProject: { ...shell.backlogByProject, ...prefs.backlogByProject },
    });
  } catch {
    // A corrupt old store is not worth blocking first launch.
  }
}
