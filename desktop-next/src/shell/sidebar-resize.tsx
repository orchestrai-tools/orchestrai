import { SidebarRail, useSidebar } from "@warpforge/ui/components/sidebar";
import { type PointerEvent, useRef } from "react";

import { useAppearance } from "../lib/appearance";
import { SIDEBAR_WIDTH_DEFAULT } from "../lib/sidebar-width";

/** Below this many pixels of travel a press on the rail is a click, which toggles the sidebar. */
const DRAG_SLOP = 3;

/**
 * The sidebar's edge: drag to resize, click to collapse, double-click for the default width.
 * The kit rail only toggles.
 */
export function SidebarResizeRail() {
  const { state, toggleSidebar } = useSidebar();
  const setWidth = useAppearance((s) => s.setSidebarWidth);
  const dragged = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || state === "collapsed") return;
    event.preventDefault();
    const rail = event.currentTarget;
    const startX = event.clientX;
    const startWidth = useAppearance.getState().sidebarWidth;
    const wrapper = rail.closest<HTMLElement>("[data-slot=sidebar-wrapper]");
    dragged.current = false;
    rail.setPointerCapture(event.pointerId);

    const move = (e: globalThis.PointerEvent) => {
      const delta = e.clientX - startX;
      if (!dragged.current && Math.abs(delta) < DRAG_SLOP) return;
      if (!dragged.current) {
        dragged.current = true;
        wrapper?.setAttribute("data-resizing", "");
      }
      setWidth(startWidth + delta);
    };
    const end = () => {
      rail.removeEventListener("pointermove", move);
      rail.removeEventListener("pointerup", end);
      rail.removeEventListener("pointercancel", end);
      wrapper?.removeAttribute("data-resizing");
    };
    rail.addEventListener("pointermove", move);
    rail.addEventListener("pointerup", end);
    rail.addEventListener("pointercancel", end);
  };

  return (
    <SidebarRail
      title="Drag to resize · click to collapse"
      aria-label="Resize or collapse the sidebar"
      className="in-data-[state=expanded]:cursor-col-resize"
      onPointerDown={onPointerDown}
      onClick={() => {
        if (dragged.current) dragged.current = false;
        else toggleSidebar();
      }}
      onDoubleClick={() => setWidth(SIDEBAR_WIDTH_DEFAULT)}
    />
  );
}
