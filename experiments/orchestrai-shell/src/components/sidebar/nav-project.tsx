import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { inboxFor } from "@/data/inbox"
import { tasksFor } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { selectPage, type PageId } from "@/lib/window-store"
import { NAV_GROUPS, PAGES, type NavGroup } from "@/pages"

/** The pages of the current project, grouped by space and short labels rather than boxes. */
export function NavProject({ group, className }: { group?: NavGroup; className?: string }) {
  const project = useAppSession((session) => session.project)
  const page = useAppSession(selectPage)
  const { setPage } = useAppActions()
  // A task is opened from the board, so the board stays the highlighted place.
  const active: PageId = page === "task" ? "board" : page
  const counts: Partial<Record<PageId, number>> = {
    inbox: inboxFor(project).length,
    board: tasksFor(project).filter((task) => task.status === "running").length,
  }

  const groups = group ? NAV_GROUPS.filter((entry) => entry.id === group) : NAV_GROUPS
  const footer = group === "footer"

  return (
    <>
      {(footer ? [{ id: "footer" as const }] : groups).map(({ id, label }: { id: NavGroup; label?: string }) => (
        <SidebarGroup key={id} className={cn("py-1", className)}>
          {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
          <SidebarMenu>
            {PAGES.filter((entry) => entry.group === id).map(({ id: pageId, title, icon: Icon }) => (
              <SidebarMenuItem key={pageId}>
                <SidebarMenuButton
                  tooltip={title}
                  isActive={active === pageId}
                  onClick={() => setPage(pageId)}
                >
                  <Icon />
                  <span>{title}</span>
                </SidebarMenuButton>
                {counts[pageId] ? (
                  <SidebarMenuBadge
                    className={cn(pageId === "inbox" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
                  >
                    {counts[pageId]}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  )
}
