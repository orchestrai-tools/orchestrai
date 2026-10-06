import type { ComponentProps } from "react"
import { HouseIcon, PlusIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ProjectBadge } from "@/components/window/project-badge"
import { INBOX, inboxFor } from "@/data/inbox"
import { tasksFor } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { PROJECTS } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * On Home the navigation is the projects themselves, each with the count that
 * matters most: what needs you, else what is running. The order stays fixed.
 */
export function HomeSidebar(props: ComponentProps<typeof Sidebar>) {
  const { selectProject } = useAppActions()
  const dialog = useDialog()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" isActive tooltip="Home">
              <div className="flex aspect-square size-8 items-center justify-center rounded-md border bg-background">
                <HouseIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">All projects</span>
                <span className="truncate text-xs text-muted-foreground">
                  {PROJECTS.length} projects · {INBOX.length} need you
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarMenu>
            {PROJECTS.map((project) => {
              const waiting = inboxFor(project.id).length
              const running = tasksFor(project.id).filter((task) => task.status === "running").length
              const count = waiting || running
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton tooltip={project.name} onClick={() => selectProject(project.id)}>
                    <ProjectBadge project={project} />
                    <span>{project.name}</span>
                  </SidebarMenuButton>
                  {count > 0 && (
                    <SidebarMenuBadge
                      title={waiting ? `${waiting} need you` : `${running} running`}
                      className={cn(waiting ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
                    >
                      {count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              )
            })}
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Open project" onClick={() => dialog.open("open-project")} className="text-muted-foreground">
                <PlusIcon />
                <span>Open project…</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
