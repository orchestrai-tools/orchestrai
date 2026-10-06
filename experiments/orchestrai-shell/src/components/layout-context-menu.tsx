import type { ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"

import { INSPECTOR_PANELS } from "@/components/inspector/inspector-panels"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useSidebar } from "@/components/ui/sidebar"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useLayoutStore, type Density, type HeaderContent, type HeaderSpan } from "@/lib/layout-store"
import { useWindowStore, type InspectorId } from "@/lib/window-store"

const CLOSED = "closed"

/**
 * Right-click anywhere for the layout. Most-used items first, the reset last
 * (NN/g's context menu order). Every item is also in the palette.
 */
export function LayoutContextMenu({ children }: { children: ReactNode }) {
  const { open: leftOpen, setOpen: setLeftOpen, toggleSidebar } = useSidebar()
  const layout = useLayoutStore(
    useShallow((state) => ({
      header: state.header,
      density: state.density,
      theme: state.theme,
      appFrame: state.appFrame,
      setHeader: state.setHeader,
      setDensity: state.setDensity,
      setTheme: state.setTheme,
      setAppFrame: state.setAppFrame,
      resetLayout: state.resetLayout,
    }))
  )
  const inspector = useAppSession(useShallow((session) => session.inspector))
  const terminalOpen = useAppSession((session) => session.terminal.open)
  const { selectInspector, closeInspector, toggleTerminal, toggleFocus } = useAppActions()
  const resetWindows = useWindowStore((state) => state.resetWindows)

  return (
    <ContextMenu>
      {/* The trigger defaults to select-none, which would block text selection across the page. */}
      <ContextMenuTrigger asChild className="select-auto">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
        <ContextMenuItem onSelect={() => toggleFocus(true)}>
          Focus mode <ContextMenuShortcut>⇧⌘\</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuCheckboxItem checked={leftOpen} onCheckedChange={toggleSidebar}>
          Sidebar <ContextMenuShortcut>⌘\</ContextMenuShortcut>
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Inspector</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={inspector.open ? inspector.active : CLOSED}
              onValueChange={(value) => (value === CLOSED ? closeInspector() : selectInspector(value as InspectorId))}
            >
              <ContextMenuRadioItem value={CLOSED}>Closed</ContextMenuRadioItem>
              <ContextMenuSeparator />
              {INSPECTOR_PANELS.map(({ id, title }) => (
                <ContextMenuRadioItem key={id} value={id}>
                  {title}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuCheckboxItem checked={terminalOpen} onCheckedChange={() => toggleTerminal()}>
          Terminal drawer <ContextMenuShortcut>⌃`</ContextMenuShortcut>
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />
        <ContextMenuLabel>Appearance</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={layout.theme === "dark"}
          onCheckedChange={(dark) => layout.setTheme(dark ? "dark" : "light")}
        >
          Dark theme
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Density</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup value={layout.density} onValueChange={(value) => layout.setDensity(value as Density)}>
              <ContextMenuRadioItem value="comfortable">Comfortable</ContextMenuRadioItem>
              <ContextMenuRadioItem value="compact">Compact</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuCheckboxItem
          checked={layout.header.visible}
          onCheckedChange={(visible) => layout.setHeader({ visible })}
        >
          Header bar
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!layout.header.visible}>Header</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={layout.header.span}
              onValueChange={(span) => layout.setHeader({ span: span as HeaderSpan })}
            >
              <ContextMenuRadioItem value="full">Full width</ContextMenuRadioItem>
              <ContextMenuRadioItem value="inset">Beside sidebar</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup
              value={layout.header.content}
              onValueChange={(content) => layout.setHeader({ content: content as HeaderContent })}
            >
              <ContextMenuRadioItem value="breadcrumbs">Breadcrumbs</ContextMenuRadioItem>
              <ContextMenuRadioItem value="menubar">App menu</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuCheckboxItem checked={layout.appFrame} onCheckedChange={layout.setAppFrame}>
          Window frame
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            layout.resetLayout()
            resetWindows()
            setLeftOpen(true)
          }}
        >
          Reset layout
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
