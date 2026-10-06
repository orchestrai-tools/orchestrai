import { XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { LayoutConfig } from "@/components/layout-config"
import { RIGHT_PANELS } from "@/components/right-panels"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"

/**
 * A fixed icon rail on the right edge with a panel that opens beside it.
 * The rail never changes; picking an icon swaps the panel, and picking the
 * open one closes it. Both halves are shadcn sidebars with collapsible="none",
 * so they share the left sidebar's provider and theme without a second
 * provider fighting over ⌘B.
 */
export function RightSidebar({ className }: { className?: string }) {
  const { open, active } = useAppSession(useShallow((session) => session.rightPanel))
  const { selectRightPanel, closeRightPanel } = useAppActions()
  const panel = RIGHT_PANELS.find((candidate) => candidate.id === active) ?? RIGHT_PANELS[0]

  return (
    <aside
      data-state={open ? "open" : "closed"}
      className={cn("sticky flex shrink-0 border-l bg-sidebar", className)}
    >
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "overflow-hidden transition-[width] duration-200 ease-linear",
          open ? "w-(--sidebar-width)" : "w-0"
        )}
      >
        <Sidebar collapsible="none" className="h-full border-r">
          <SidebarHeader className="flex-row items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-medium">{panel.title}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={closeRightPanel}
              aria-label={`Close ${panel.title}`}
            >
              <XIcon />
            </Button>
          </SidebarHeader>
          <SidebarContent>
            <panel.Content />
          </SidebarContent>
        </Sidebar>
      </div>

      <Sidebar collapsible="none" className="w-(--sidebar-width-icon)">
        <SidebarContent>
          <SidebarGroup className="px-1.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {RIGHT_PANELS.map(({ id, title, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          isActive={open && active === id}
                          aria-pressed={open && active === id}
                          aria-label={title}
                          onClick={() => selectRightPanel(id)}
                          className="justify-center"
                        >
                          <Icon />
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="left">{title}</TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-1.5">
          <LayoutConfig />
        </SidebarFooter>
      </Sidebar>
    </aside>
  )
}
