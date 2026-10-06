import { useEffect, type CSSProperties } from 'react';
import { Panel, usePanelRef } from 'react-resizable-panels';
import { edgeSkewDeg } from '../../lib/edgeGeometry';
import { LAYOUT_LIMITS } from '../../settings/defaults';
import { useCollapseMotion, useSettingsActions, useSidebarSettings } from '../../settings/store';
import type { Side } from '../../settings/types';
import { sidebarPanelId } from './useLayoutSync';

/** Small allowance so the transition flag outlives the last animated frame. */
const TRANSITION_SETTLE_MS = 50;

/**
 * A collapsible sidebar panel. The settings store is the source of truth:
 * store changes (inspector, edge click) are pushed into the panel through its
 * imperative API; user resizes flow back through useLayoutSync.
 */
export function SidebarPanel({ side }: { side: Side }) {
  const layout = useCollapseMotion();
  const { setLayoutTransition } = useSettingsActions();
  const sidebar = useSidebarSettings(side);
  const panelRef = usePanelRef();

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || panel.isCollapsed() === sidebar.collapsed) return;

    // Animate only programmatic collapse/expand; drag and keyboard stay immediate.
    setLayoutTransition(true);
    if (sidebar.collapsed) panel.collapse();
    else panel.expand();
    const timer = window.setTimeout(
      () => setLayoutTransition(false),
      layout.collapseDurationMs + TRANSITION_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [panelRef, sidebar.collapsed, layout.collapseDurationMs, setLayoutTransition]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || sidebar.collapsed) return;
    if (Math.abs(panel.getSize().inPixels - sidebar.widthPx) >= 1) panel.resize(sidebar.widthPx);
  }, [panelRef, sidebar.collapsed, sidebar.widthPx]);

  const style = {
    overflow: 'visible',
    '--edge-skew': `${edgeSkewDeg(side, sidebar)}deg`,
  } as CSSProperties;

  return (
    <Panel
      id={sidebarPanelId(side)}
      panelRef={panelRef}
      className="sidebar"
      style={style}
      data-side={side}
      data-collapsed={sidebar.collapsed}
      aria-label={side === 'left' ? 'Primary sidebar' : 'Secondary sidebar'}
      collapsible
      collapsedSize={layout.collapsedWidthPx}
      minSize={LAYOUT_LIMITS.minWidthPx}
      maxSize={LAYOUT_LIMITS.maxWidthPx}
      defaultSize={sidebar.collapsed ? layout.collapsedWidthPx : sidebar.widthPx}
      groupResizeBehavior="preserve-pixel-size"
    >
      <div className="sidebar__backdrop" aria-hidden="true" />
      <div className="sidebar__content" inert={sidebar.collapsed} />
    </Panel>
  );
}
