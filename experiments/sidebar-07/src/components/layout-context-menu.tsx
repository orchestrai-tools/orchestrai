import type { ReactNode } from "react"
import { PanelBottomIcon, PanelRightIcon, PanelTopIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { RIGHT_PANELS } from "@/components/right-panels"
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
import { useLayoutStore, type HeaderContent, type HeaderSpan } from "@/lib/layout-store"
import { useWindowStore, type RightPanelId } from "@/lib/window-store"

const CLOSED = "closed"

/**
 * Right-click anywhere for the layout settings. Mirrors the popover on the
 * right rail and adds the sidebars. Must render inside SidebarProvider.
 */
export function LayoutContextMenu({ children }: { children: ReactNode }) {
  const { open: leftOpen, setOpen: setLeftOpen, toggleSidebar } = useSidebar()
  const header = useLayoutStore(useShallow((state) => state.header))
  const rightPanel = useAppSession(useShallow((session) => session.rightPanel))
  const drawersModal = useLayoutStore((state) => state.drawersModal)
  const drawerSnapPoints = useLayoutStore((state) => state.drawerSnapPoints)
  const windowControls = useLayoutStore((state) => state.windowControls)
  const appFrame = useLayoutStore((state) => state.appFrame)
  const setAppFrame = useLayoutStore((state) => state.setAppFrame)
  const { selectRightPanel, closeRightPanel, setOpenDrawer } = useAppActions()
  const resetWindows = useWindowStore((state) => state.resetWindows)
  const { setHeader, resetLayout, setDrawersModal, setDrawerSnapPoints, setWindowControls } =
    useLayoutStore(
      useShallow((state) => ({
        setWindowControls: state.setWindowControls,
        setHeader: state.setHeader,
        resetLayout: state.resetLayout,
        setDrawersModal: state.setDrawersModal,
        setDrawerSnapPoints: state.setDrawerSnapPoints,
      }))
    )

  return (
    <ContextMenu>
      {/* The trigger defaults to select-none, which would block text selection across the page. */}
      <ContextMenuTrigger asChild className="select-auto">
        {children}
      </ContextMenuTrigger>
      {/* Returning focus to the page would pull it out of a drawer opened from this menu. */}
      <ContextMenuContent className="w-56" onCloseAutoFocus={(event) => event.preventDefault()}>
        <ContextMenuLabel>Layout</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={header.visible}
          onCheckedChange={(visible) => setHeader({ visible })}
        >
          Header Bar
        </ContextMenuCheckboxItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!header.visible}>Header Width</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={header.span}
              onValueChange={(span) => setHeader({ span: span as HeaderSpan })}
            >
              <ContextMenuRadioItem value="full">Full width</ContextMenuRadioItem>
              <ContextMenuRadioItem value="inset">Beside sidebar</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!header.visible}>Header Content</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={header.content}
              onValueChange={(content) => setHeader({ content: content as HeaderContent })}
            >
              <ContextMenuRadioItem value="breadcrumbs">Breadcrumbs</ContextMenuRadioItem>
              <ContextMenuRadioItem value="menubar">App menu</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuCheckboxItem checked={appFrame} onCheckedChange={setAppFrame}>
          Window Frame
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked={windowControls} onCheckedChange={setWindowControls}>
          Window Controls
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked={leftOpen} onCheckedChange={toggleSidebar}>
          Left Sidebar
          <ContextMenuShortcut>⌘B</ContextMenuShortcut>
        </ContextMenuCheckboxItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Right Panel</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuRadioGroup
              value={rightPanel.open ? rightPanel.active : CLOSED}
              onValueChange={(value) =>
                value === CLOSED ? closeRightPanel() : selectRightPanel(value as RightPanelId)
              }
            >
              <ContextMenuRadioItem value={CLOSED}>Closed</ContextMenuRadioItem>
              <ContextMenuSeparator />
              {RIGHT_PANELS.map(({ id, title }) => (
                <ContextMenuRadioItem key={id} value={id}>
                  {title}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuLabel>Drawers</ContextMenuLabel>
        <ContextMenuItem onSelect={() => setOpenDrawer("right")}>
          <PanelRightIcon />
          Right Drawer
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setOpenDrawer("bottom")}>
          <PanelBottomIcon />
          Bottom Drawer
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setOpenDrawer("top")}>
          <PanelTopIcon />
          Top Drawer
        </ContextMenuItem>
        <ContextMenuCheckboxItem
          checked={!drawersModal}
          onCheckedChange={(nonModal) => setDrawersModal(!nonModal)}
        >
          Non-modal
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked={drawerSnapPoints} onCheckedChange={setDrawerSnapPoints}>
          Snap Points
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            resetLayout()
            resetWindows()
            setLeftOpen(true)
          }}
        >
          Reset Layout
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
