import type { CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"

import { AppDrawers } from "@/components/app-drawers"
import { AppSidebar } from "@/components/app-sidebar"
import { LayoutContextMenu } from "@/components/layout-context-menu"
import { RightSidebar } from "@/components/right-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useProjectShortcuts } from "@/hooks/use-project-shortcuts"
import { useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { useLayoutStore } from "@/lib/layout-store"
import { selectPage } from "@/lib/window-store"
import { findPage } from "@/pages"

const HEADER_HEIGHT = "3.5rem"

/**
 * One app's contents: sidebars, header, page, and drawers, fitted inside
 * its window. The main column scrolls on its own and the sidebars span the
 * window. Only the focused window answers keyboard shortcuts.
 */
export function AppShell() {
  const header = useLayoutStore(useShallow((state) => state.header))
  const fullHeader = header.visible && header.span === "full"
  const insetHeader = header.visible && header.span === "inset"
  const page = findPage(useAppSession(selectPage))
  const front = useIsFrontApp()
  useProjectShortcuts()

  return (
    <SidebarProvider
      keyboardShortcut={front}
      className="h-full min-h-0 flex-col"
      style={{ "--header-height": fullHeader ? HEADER_HEIGHT : "0px" } as CSSProperties}
    >
      <LayoutContextMenu>
        <div className="flex min-h-0 flex-1 flex-col">
          {fullHeader && <SiteHeader span="full" content={header.content} />}
          <div className="flex min-h-0 flex-1">
            <AppSidebar className="top-(--header-height) h-auto!" />
            <SidebarInset className="min-h-0 min-w-0 overflow-y-auto">
              {insetHeader && <SiteHeader span="inset" content={header.content} />}
              <div className="flex flex-1 flex-col gap-4 p-4 [header+&]:pt-0">
                <page.Component />
              </div>
            </SidebarInset>
            <RightSidebar className="static h-auto" />
          </div>
        </div>
      </LayoutContextMenu>
      <AppDrawers />
    </SidebarProvider>
  )
}
