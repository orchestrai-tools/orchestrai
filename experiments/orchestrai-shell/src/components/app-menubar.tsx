import { useShallow } from "zustand/react/shallow"

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { useSidebar } from "@/components/ui/sidebar"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { useLayoutStore } from "@/lib/layout-store"

/**
 * A desktop-style menu on shadcn's Base UI menubar, holding the same actions
 * as the palette with the same shortcuts. Menus get an explicit width because
 * Base UI sizes them to their trigger by default.
 */
export function AppMenubar() {
  const { open: leftOpen, toggleSidebar } = useSidebar()
  const appFrame = useLayoutStore((state) => state.appFrame)
  const { usesTabs, inspector, terminalOpen, project, openCount, windowZoom } = useAppSession(
    useShallow((session) => ({
      usesTabs: session.projectNav === "tabs",
      inspector: session.inspector,
      terminalOpen: session.terminal.open,
      project: session.project,
      openCount: session.openProjects.length,
      windowZoom: session.zoom,
    }))
  )
  const actions = useAppActions()
  const dialog = useDialog()

  return (
    <Menubar className="h-auto border-none bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={() => dialog.open("new-task")}>
            New Task <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => dialog.open("open-project")}>
            Open Project… <MenubarShortcut>⌘O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          {usesTabs ? (
            <MenubarItem onClick={() => actions.closeProject(project)}>
              Close Project Tab <MenubarShortcut>⌘W</MenubarShortcut>
            </MenubarItem>
          ) : (
            <MenubarItem onClick={() => actions.setWindowState("closed")}>
              Close Window <MenubarShortcut>⌘W</MenubarShortcut>
            </MenubarItem>
          )}
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Go</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={() => actions.openHome()}>
            Home <MenubarShortcut>⌃1</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => actions.setPage("board")}>
            Board <MenubarShortcut>G B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => actions.setPage("inbox")}>
            Inbox <MenubarShortcut>G I</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => actions.setPage("docs")}>
            Docs <MenubarShortcut>G D</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => dialog.open("palette")}>
            Command Palette <MenubarShortcut>⌘K</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={() => actions.toggleFocus(true)}>
            Focus Mode <MenubarShortcut>⇧⌘\</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={leftOpen} onCheckedChange={toggleSidebar}>
            Sidebar <MenubarShortcut>⌘\</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={inspector.open}
            onCheckedChange={(open) => (open ? actions.selectInspector(inspector.active) : actions.closeInspector())}
          >
            Inspector <MenubarShortcut>⌥⌘I</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={terminalOpen} onCheckedChange={(open) => actions.toggleTerminal(open)}>
            Terminal Drawer <MenubarShortcut>⌃`</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={usesTabs} onCheckedChange={(tabs) => actions.setProjectNav(tabs ? "tabs" : "dropdown")}>
            Project Tabs
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Window</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem onClick={() => actions.setWindowState("minimized")}>
            Minimize <MenubarShortcut>⌘M</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={!appFrame || windowZoom === "fullscreen"}
            onClick={() => actions.setZoom(windowZoom === "zoomed" ? "normal" : "zoomed")}
          >
            Zoom
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => actions.cycleProject(-1)} disabled={usesTabs && openCount === 0}>
            Previous Project <MenubarShortcut>⌃⇧⇥</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => actions.cycleProject(1)} disabled={usesTabs && openCount === 0}>
            Next Project <MenubarShortcut>⌃⇥</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent className="w-56">
          <MenubarItem>Keyboard Shortcuts</MenubarItem>
          <MenubarItem>Export My Data…</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>About OrchestrAI</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
