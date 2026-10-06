import { AppMenubar } from "@/components/app-menubar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useAppSession } from "@/lib/app-instance"
import type { HeaderContent, HeaderSpan } from "@/lib/layout-store"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { selectPage } from "@/lib/window-store"
import { findPage } from "@/pages"

function PageBreadcrumbs() {
  const page = findPage(useAppSession(selectPage))
  const project = findProject(useAppSession((session) => session.project))
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">{project.name}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="#">{page.section}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{page.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * `full` follows shadcn's sidebar-16 site header: sticky across the window,
 * with the sidebars starting below it. `inset` is sidebar-07's header inside
 * the page, which shrinks while the left sidebar is collapsed to icons.
 */
export function SiteHeader({
  span,
  content,
}: {
  span: HeaderSpan
  content: HeaderContent
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2 px-4",
        span === "full"
          ? "sticky top-0 z-50 h-(--header-height) w-full border-b bg-background"
          : "h-16 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
      )}
    >
      {content === "menubar" ? <AppMenubar /> : <PageBreadcrumbs />}
    </header>
  )
}
