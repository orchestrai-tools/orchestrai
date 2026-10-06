import { debounce, toMerged } from 'es-toolkit';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_SETTINGS } from './defaults';
import type {
  GridLayerSettings,
  GridRegion,
  GridSettings,
  LayoutSettings,
  Settings,
  SettingsSlice,
  Side,
  SidebarSettings,
} from './types';

interface SettingsActions {
  update: <K extends SettingsSlice>(slice: K, patch: Partial<Settings[K]>) => void;
  updateSidebar: (side: Side, patch: Partial<SidebarSettings>) => void;
  /** While the grid is linked, the patch applies to every region. */
  updateGrid: (region: GridRegion, patch: Partial<GridLayerSettings>) => void;
  /** Linking copies `source`'s grid to the other regions so they start out identical. */
  setGridLinked: (linked: boolean, source: GridRegion) => void;
  toggleCollapsed: (side: Side) => void;
  setLayoutTransition: (active: boolean) => void;
  reset: () => void;
}

interface SettingsState {
  settings: Settings;
  /** Transient (not persisted): a programmatic collapse/expand is animating. */
  layoutTransition: boolean;
  actions: SettingsActions;
}

const STORAGE_KEY = 'experiments.edge-tuner';
/**
 * v2: ripple changed from rings to a surface wave; older ripple settings are dropped.
 * v3: the ripple rim merged into the border.
 * v4: the magnet tab grows out of the border, so its base inset is gone.
 */
const STORAGE_VERSION = 4;
const REMOVED_KEYS: readonly { version: number; slice: SettingsSlice; keys: readonly string[] }[] = [
  { version: 3, slice: 'ripple', keys: ['showRim', 'rimWidthPx', 'rimTintPercent'] },
  { version: 4, slice: 'magnet', keys: ['baseInsetPx'] },
];
const PERSIST_DEBOUNCE_MS = 250;

/**
 * Coalesces writes so dragging an edge or a slider doesn't serialize and write
 * localStorage on every pointer move; pending writes flush when the page hides.
 */
function createDebouncedStorage(storage: Storage): StateStorage {
  const write = debounce((name: string, value: string) => storage.setItem(name, value), PERSIST_DEBOUNCE_MS);
  window.addEventListener('pagehide', () => write.flush());
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => write(name, value),
    removeItem: (name) => {
      write.cancel();
      storage.removeItem(name);
    },
  };
}

function withSidebar(layout: LayoutSettings, side: Side, sidebar: SidebarSettings): LayoutSettings {
  return side === 'left' ? { ...layout, left: sidebar } : { ...layout, right: sidebar };
}

/** Applies a sidebar patch; while linked, width and angle mirror to the other side (collapse never does). */
function patchSidebar(layout: LayoutSettings, side: Side, patch: Partial<SidebarSettings>) {
  const next = withSidebar(layout, side, { ...layout[side], ...patch });
  if (!layout.linked) return next;

  const shared: Partial<SidebarSettings> = {};
  if (patch.widthPx !== undefined) shared.widthPx = patch.widthPx;
  if (patch.angleDeg !== undefined) shared.angleDeg = patch.angleDeg;
  if (Object.keys(shared).length === 0) return next;

  const other: Side = side === 'left' ? 'right' : 'left';
  return withSidebar(next, other, { ...next[other], ...shared });
}

const GRID_REGIONS: readonly GridRegion[] = ['left', 'main', 'right'];

function patchGrid(grid: GridSettings, region: GridRegion, patch: Partial<GridLayerSettings>): GridSettings {
  const targets = grid.linked ? GRID_REGIONS : [region];
  const next = { ...grid };
  for (const target of targets) next[target] = { ...grid[target], ...patch };
  return next;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      layoutTransition: false,
      actions: {
        update: (slice, patch) =>
          set(({ settings }) => ({
            settings: { ...settings, [slice]: { ...settings[slice], ...patch } },
          })),
        updateSidebar: (side, patch) =>
          set(({ settings }) => ({
            settings: { ...settings, layout: patchSidebar(settings.layout, side, patch) },
          })),
        updateGrid: (region, patch) =>
          set(({ settings }) => ({
            settings: { ...settings, grid: patchGrid(settings.grid, region, patch) },
          })),
        setGridLinked: (linked, source) =>
          set(({ settings }) => {
            const { grid } = settings;
            const layer = grid[source];
            return {
              settings: {
                ...settings,
                grid: linked ? { ...grid, linked, left: layer, main: layer, right: layer } : { ...grid, linked },
              },
            };
          }),
        toggleCollapsed: (side) =>
          set(({ settings }) => ({
            settings: {
              ...settings,
              layout: patchSidebar(settings.layout, side, {
                collapsed: !settings.layout[side].collapsed,
              }),
            },
          })),
        setLayoutTransition: (active) => set({ layoutTransition: active }),
        reset: () => set({ settings: DEFAULT_SETTINGS }),
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => createDebouncedStorage(localStorage)),
      partialize: ({ settings }) => ({ settings }),
      migrate: (persisted, version) => {
        const state = persisted as { settings?: Partial<Settings> } | undefined;
        if (!state?.settings || version >= STORAGE_VERSION) return state;
        const settings: Record<string, unknown> = { ...state.settings };
        if (version < 2) delete settings.ripple;
        for (const removal of REMOVED_KEYS) {
          const slice = settings[removal.slice];
          if (version >= removal.version || !slice) continue;
          const pruned: Record<string, unknown> = { ...slice };
          for (const key of removal.keys) delete pruned[key];
          settings[removal.slice] = pruned;
        }
        return { settings: settings as Partial<Settings> };
      },
      // Deep-merge so settings added after a payload was saved fall back to their defaults.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<Pick<SettingsState, 'settings'>> | undefined)?.settings;
        return stored ? { ...current, settings: toMerged(current.settings, stored) } : current;
      },
    },
  ),
);

export const useSettings = () => useSettingsStore((state) => state.settings);

export const useSettingsSlice = <K extends SettingsSlice>(slice: K): Settings[K] =>
  useSettingsStore((state) => state.settings[slice]);

export const useSettingsActions = () => useSettingsStore((state) => state.actions);

export const useLayoutTransition = () => useSettingsStore((state) => state.layoutTransition);

export const useSidebarSettings = (side: Side): SidebarSettings =>
  useSettingsStore((state) => state.settings.layout[side]);

/** Collapse motion knobs only, so width changes during a drag don't re-render their consumers. */
export const useCollapseMotion = () =>
  useSettingsStore(
    useShallow(({ settings: { layout } }) => ({
      collapsedWidthPx: layout.collapsedWidthPx,
      collapseDurationMs: layout.collapseDurationMs,
      collapseEasing: layout.collapseEasing,
    })),
  );
