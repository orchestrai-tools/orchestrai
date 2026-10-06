import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectPage } from "@/lib/window-store"
import { PAGES } from "@/pages"

/** Switches the current project between the dashboard and the component demos. */
export function NavPages() {
  const page = useAppSession(selectPage)
  const { setPage } = useAppActions()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Pages</SidebarGroupLabel>
      <SidebarMenu>
        {PAGES.map(({ id, title, icon: Icon }) => (
          <SidebarMenuItem key={id}>
            <SidebarMenuButton tooltip={title} isActive={page === id} onClick={() => setPage(id)}>
              <Icon />
              <span>{title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
