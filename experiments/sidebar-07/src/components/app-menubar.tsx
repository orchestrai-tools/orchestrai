import { useShallow } from "zustand/react/shallow"

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { useSidebar } from "@/components/ui/sidebar"
import { useAppActions, useAppId, useAppSession } from "@/lib/app-instance"
import { findApp } from "@/lib/apps"
import { useLayoutStore } from "@/lib/layout-store"
import { PROJECTS } from "@/lib/projects"

/**
 * A desktop-style application menu on shadcn's Base UI menubar. Tab, View,
 * and Window items drive the real app; the rest are placeholders. Menus get an explicit
 * width because Base UI sizes them to their trigger by default.
 */
export function AppMenubar() {
  const { open: leftOpen, toggleSidebar } = useSidebar()
  const headerVisible = useLayoutStore((state) => state.header.visible)
  const setHeader = useLayoutStore((state) => state.setHeader)
  const appFrame = useLayoutStore((state) => state.appFrame)
  const usesTabs = findApp(useAppId()).projectNav === "tabs"
  const { rightPanel, project, openCount, windowZoom } = useAppSession(
    useShallow((session) => ({
      rightPanel: session.rightPanel,
      project: session.project,
      openCount: session.openProjects.length,
      windowZoom: session.zoom,
    }))
  )
  const {
    selectRightPanel,
    closeRightPanel,
    newProjectTab,
    closeProject,
    cycleProject,
    setZoom,
    setWindowState,
  } = useAppActions()

  return (
    <Menubar className="h-auto border-none bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent className="w-56">
          {usesTabs && (
            <MenubarItem onClick={newProjectTab} disabled={openCount >= PROJECTS.length}>
              New Tab <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
          )}
          <MenubarItem>
            New Window <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          {usesTabs ? (
            <MenubarItem onClick={() => closeProject(project)}>
              Close Tab <MenubarShortcut>⌘W</MenubarShortcut>
            </MenubarItem>
          ) : (
            <MenubarItem onClick={() => setWindowState("closed")}>
              Close Window <MenubarShortcut>⌘W</MenubarShortcut>
            </MenubarItem>
          )}
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Share</MenubarSubTrigger>
            <MenubarSubContent className="w-44">
              <MenubarItem>Email link</MenubarItem>
              <MenubarItem>Messages</MenubarItem>
              <MenubarItem>Notes</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            Print… <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem>
            Undo <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Cut <MenubarShortcut>⌘X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Copy <MenubarShortcut>⌘C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Paste <MenubarShortcut>⌘V</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Find… <MenubarShortcut>⌘F</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarCheckboxItem
            checked={headerVisible}
            onCheckedChange={(visible) => setHeader({ visible })}
          >
            Header Bar
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={leftOpen} onCheckedChange={toggleSidebar}>
            Sidebar <MenubarShortcut>⌘B</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={rightPanel.open}
            onCheckedChange={(open) =>
              open ? selectRightPanel(rightPanel.active) : closeRightPanel()
            }
          >
            Right Panel
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem>
            Enter Full Screen <MenubarShortcut>⌃⌘F</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Window</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={() => setWindowState("minimized")}>
            Minimize <MenubarShortcut>⌘M</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={!appFrame || windowZoom === "fullscreen"}
            onClick={() => setZoom(windowZoom === "zoomed" ? "normal" : "zoomed")}
          >
            Zoom
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cycleProject(-1)} disabled={usesTabs && openCount < 2}>
            {usesTabs ? "Show Previous Tab" : "Previous Project"} <MenubarShortcut>⌃⇧⇥</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cycleProject(1)} disabled={usesTabs && openCount < 2}>
            {usesTabs ? "Show Next Tab" : "Next Project"} <MenubarShortcut>⌃⇥</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Bring All to Front</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem>Documentation</MenubarItem>
          <MenubarItem>Keyboard Shortcuts</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>About</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
