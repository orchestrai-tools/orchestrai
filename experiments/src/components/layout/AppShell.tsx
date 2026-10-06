import { useMemo } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import { computePalette } from '../../lib/palette';
import { buildThemeVariables } from '../../lib/themeVariables';
import { useCollapseMotion, useLayoutTransition, useSettingsSlice } from '../../settings/store';
import { SidebarEdge } from '../edge/SidebarEdge';
import { FloatingInspector } from '../inspector/FloatingInspector';
import { SidebarPanel } from './SidebarPanel';
import { useLayoutSync } from './useLayoutSync';

const MAIN_MIN_WIDTH_PX = 240;
const COARSE_POINTER_TARGET_PX = 28;

export function AppShell() {
  const paletteSettings = useSettingsSlice('palette');
  const border = useSettingsSlice('border');
  const lightsaber = useSettingsSlice('lightsaber');
  const badge = useSettingsSlice('badge');
  const grid = useSettingsSlice('grid');
  const layout = useCollapseMotion();
  const layoutTransition = useLayoutTransition();
  const { groupRef, onLayoutChange } = useLayoutSync();

  const palette = useMemo(() => computePalette(paletteSettings), [paletteSettings]);
  const themeStyle = useMemo(
    () => buildThemeVariables({ palette, border, lightsaber, badge, grid, layout }),
    [palette, border, lightsaber, badge, grid, layout],
  );

  return (
    <div
      className="theme-root"
      style={themeStyle}
      data-border-hidden={border.hidden}
      data-hover-only={border.hoverOnly}
      data-lightsaber={lightsaber.enabled}
    >
      <Group
        className="app-shell"
        elementRef={groupRef}
        orientation="horizontal"
        disableCursor
        resizeTargetMinimumSize={{
          fine: border.hitTargetPx,
          coarse: Math.max(border.hitTargetPx, COARSE_POINTER_TARGET_PX),
        }}
        onLayoutChange={onLayoutChange}
        data-layout-transition={layoutTransition}
      >
        <SidebarPanel side="left" />
        <SidebarEdge side="left" />
        <Panel id="main" className="app-main" minSize={MAIN_MIN_WIDTH_PX} />
        <SidebarEdge side="right" />
        <SidebarPanel side="right" />
      </Group>
      <FloatingInspector />
    </div>
  );
}
