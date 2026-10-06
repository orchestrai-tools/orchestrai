import { XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { HomeSummary } from "@/components/home/home-summary"
import { INSPECTOR_PANELS } from "@/components/inspector/inspector-panels"
import { LayoutConfig } from "@/components/layout-config"
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
 * The inspector: a fixed icon rail on the trailing edge with a panel beside
 * it. The rail never moves; picking an icon swaps the panel, and picking the
 * open one closes it. Collapsing is on purpose, never on hover.
 */
export function RightSidebar({ className }: { className?: string }) {
  const { open, active } = useAppSession(useShallow((session) => session.inspector))
  const home = useAppSession((session) => session.home)
  const { selectInspector, closeInspector } = useAppActions()
  const panel = INSPECTOR_PANELS.find((candidate) => candidate.id === active) ?? INSPECTOR_PANELS[0]

  return (
    <aside data-state={open ? "open" : "closed"} className={cn("flex shrink-0 border-l bg-sidebar", className)}>
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn("overflow-hidden transition-[width] duration-200 ease-linear", open ? "w-72" : "w-0")}
      >
        <Sidebar collapsible="none" className="h-full w-72 border-r">
          <SidebarHeader className="h-10 flex-row items-center justify-between border-b px-4 py-0">
            <span className="text-sm font-medium">{panel.title}</span>
            <Button variant="ghost" size="icon-xs" onClick={closeInspector} aria-label={`Close ${panel.title}`}>
              <XIcon />
            </Button>
          </SidebarHeader>
          <SidebarContent>
            {!home ? (
              <panel.Content />
            ) : panel.id === "details" ? (
              <HomeSummary />
            ) : (
              <p className="p-4 text-xs text-muted-foreground">Open a task from the board to see its {panel.title.toLowerCase()}.</p>
            )}
          </SidebarContent>
        </Sidebar>
      </div>

      <Sidebar collapsible="none" className="w-(--sidebar-width-icon)">
        <SidebarContent>
          <SidebarGroup className="px-1.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {INSPECTOR_PANELS.map(({ id, title, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          isActive={open && active === id}
                          aria-pressed={open && active === id}
                          aria-label={title}
                          onClick={() => selectInspector(id)}
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
