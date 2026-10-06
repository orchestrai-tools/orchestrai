import type { CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { FocusEdge } from "@/components/focus-edge"
import { HomeSidebar } from "@/components/home/home-sidebar"
import { LayoutContextMenu } from "@/components/layout-context-menu"
import { NewTaskDialog } from "@/components/new-task-dialog"
import { OpenProjectDialog } from "@/components/open-project-dialog"
import { RightSidebar } from "@/components/right-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TerminalPanel, TerminalStrip } from "@/components/terminal-drawer"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAppShortcuts } from "@/hooks/use-app-shortcuts"
import { useProjectShortcuts } from "@/hooks/use-project-shortcuts"
import { useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { useLayoutStore } from "@/lib/layout-store"
import { selectPage } from "@/lib/window-store"
import { findPage } from "@/pages"
import { HomePage } from "@/pages/home"

const HEADER_HEIGHT = "3rem"

function Shortcuts() {
  useAppShortcuts()
  useProjectShortcuts()
  return null
}

/** The page itself, scrolling on its own. Pages that need the full height (docs, task) opt out of padding. */
function Work() {
  const header = useLayoutStore(useShallow((state) => state.header))
  const focus = useAppSession((session) => session.focus)
  const page = findPage(useAppSession(selectPage))
  const insetHeader = header.visible && header.span === "inset" && !focus

  return (
    <div className="flex h-full min-h-0 flex-col">
      {insetHeader && <SiteHeader span="inset" content={header.content} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <page.Component />
      </div>
    </div>
  )
}

/** Home keeps the same regions; its navigation is the projects and it has no project terminals. */
function HomeLayout({ focus }: { focus: boolean }) {
  return (
    <div className="flex min-h-0 flex-1">
      {!focus && <HomeSidebar className="top-(--header-height) h-auto!" />}
      <SidebarInset className="min-h-0 min-w-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <HomePage />
        </div>
      </SidebarInset>
      {!focus && <RightSidebar className="static h-auto" />}
    </div>
  )
}

function ProjectLayout({ focus, terminalOpen }: { focus: boolean; terminalOpen: boolean }) {
  return (
    <div className="flex min-h-0 flex-1">
      {!focus && <AppSidebar className="top-(--header-height) h-auto!" />}
      <SidebarInset className="min-h-0 min-w-0">
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel id="work" defaultSize="70%" minSize="30%">
            <Work />
          </ResizablePanel>
          {terminalOpen && !focus && (
            <>
              <ResizableHandle />
              <ResizablePanel id="terminal" defaultSize="30%" minSize="12%">
                <TerminalPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        {!focus && <TerminalStrip />}
      </SidebarInset>
      {!focus && <RightSidebar className="static h-auto" />}
    </div>
  )
}

/**
 * A window's workspace: Home or one project. A fixed skeleton of regions:
 * sidebar (navigation), work (center), inspector (trailing), and for a
 * project the terminal drawer (bottom). Focus mode hides the chrome and never
 * the work.
 */
export function AppShell() {
  const header = useLayoutStore(useShallow((state) => state.header))
  const focus = useAppSession((session) => session.focus)
  const home = useAppSession((session) => session.home)
  const terminalOpen = useAppSession((session) => session.terminal.open)
  const front = useIsFrontApp()
  const fullHeader = header.visible && header.span === "full" && !focus && !home

  return (
    <SidebarProvider
      keyboardShortcut={front}
      className="h-full min-h-0 flex-col"
      style={{ "--header-height": fullHeader ? HEADER_HEIGHT : "0px" } as CSSProperties}
    >
      <Shortcuts />
      <LayoutContextMenu>
        <div className="flex min-h-0 flex-1 flex-col">
          {fullHeader && <SiteHeader span="full" content={header.content} />}
          {home ? <HomeLayout focus={focus} /> : <ProjectLayout focus={focus} terminalOpen={terminalOpen} />}
        </div>
      </LayoutContextMenu>
      {focus && <FocusEdge />}
      <CommandPalette />
      <NewTaskDialog />
      <OpenProjectDialog />
    </SidebarProvider>
  )
}
