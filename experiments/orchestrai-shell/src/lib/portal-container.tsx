import { createContext, useContext } from "react"

/**
 * Where overlays (popovers, menus, tooltips, drawers, sheets) portal to.
 * Inside the emulated app window this is the window's content element, so
 * overlays stay inside the window instead of covering the desktop. Outside
 * it, components fall back to their default of document.body.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export const PortalContainerProvider = PortalContainerContext.Provider

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
