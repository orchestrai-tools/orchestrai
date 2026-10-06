import type { ComponentProps } from "react"
import { PlusIcon } from "lucide-react"

import { CommandBar } from "@/components/sidebar/command-bar"
import { NavProject } from "@/components/sidebar/nav-project"
import { WorktreeSwitcher } from "@/components/sidebar/worktree-switcher"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useNewTask } from "@/components/new-task-dialog"

/**
 * Navigation for the current project: which worktree, which page, and the
 * shell command bar. One primary action, New task, lives here on every page.
 */
export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const openNewTask = useNewTask()
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <WorktreeSwitcher />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="New task" onClick={openNewTask}>
              <PlusIcon />
              <span>New task</span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘N</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <NavProject />
        <NavProject group="footer" className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="pb-3">
        <CommandBar />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
