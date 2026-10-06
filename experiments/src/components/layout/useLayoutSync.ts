import { useRef } from 'react';
import type { Layout } from 'react-resizable-panels';
import { LAYOUT_LIMITS } from '../../settings/defaults';
import { useSettingsStore } from '../../settings/store';
import type { Side } from '../../settings/types';

const SIDES: readonly Side[] = ['left', 'right'];

export const sidebarPanelId = (side: Side) => `sidebar-${side}`;

/**
 * Writes panel-group layout changes (drag, keyboard, imperative calls) back to
 * the settings store. Layout events carry the library's target layout, not
 * DOM measurements, so they stay correct while a collapse is animating.
 */
export function useLayoutSync() {
  const groupRef = useRef<HTMLDivElement>(null);

  const onLayoutChange = (layout: Layout) => {
    const group = groupRef.current;
    if (!group) return;

    // Percentages are of the space left after separators: the sum of panel widths.
    const availablePx = [...group.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-panel'))
      .reduce((total, panel) => total + panel.offsetWidth, 0);
    if (availablePx === 0) return;

    const { settings, actions } = useSettingsStore.getState();
    for (const side of SIDES) {
      const percent = layout[sidebarPanelId(side)];
      if (percent === undefined) continue;

      const widthPx = Math.round((percent / 100) * availablePx);
      // A collapsible panel never rests between collapsedSize (≤ 72px) and minSize (160px).
      const collapsed = widthPx < LAYOUT_LIMITS.minWidthPx;
      const current = settings.layout[side];
      if (collapsed) {
        if (!current.collapsed) actions.updateSidebar(side, { collapsed: true });
      } else if (current.collapsed || widthPx !== current.widthPx) {
        actions.updateSidebar(side, { collapsed: false, widthPx });
      }
    }
  };

  return { groupRef, onLayoutChange };
}
