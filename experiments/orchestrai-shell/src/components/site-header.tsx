import { Fragment } from "react"

import { AppMenubar } from "@/components/app-menubar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { findDoc } from "@/data/docs"
import { findTask } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import type { HeaderContent, HeaderSpan } from "@/lib/layout-store"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { selectPage, selectSelection, type PageId } from "@/lib/window-store"
import { findPage } from "@/pages"

/** Project › page › item. Every crumb but the last is a link back. */
function PageBreadcrumbs() {
  const project = findProject(useAppSession((session) => session.project))
  const page = useAppSession(selectPage)
  const task = findTask(useAppSession((session) => selectSelection(session, "task")))
  const doc = findDoc(useAppSession((session) => selectSelection(session, "doc")))
  const { setPage } = useAppActions()

  const trail: { label: string; page?: PageId }[] = [{ label: project.name, page: "board" }]
  if (page === "task") trail.push({ label: "Board", page: "board" }, { label: task?.title ?? "Task" })
  else if (page === "docs" && doc) trail.push({ label: "Docs", page: "docs" }, { label: doc.title })
  else trail.push({ label: findPage(page).title })

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className={cn("min-w-0", index < trail.length - 1 && index > 0 && "hidden md:block")}>
              {index === trail.length - 1 ? (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    if (crumb.page) setPage(crumb.page)
                  }}
                >
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * `full` follows shadcn's sidebar-16 site header: sticky across the window,
 * with the sidebars starting below it. `inset` sits beside the left sidebar.
 */
export function SiteHeader({ span, content }: { span: HeaderSpan; content: HeaderContent }) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2 px-4",
        span === "full"
          ? "sticky top-0 z-50 h-(--header-height) w-full border-b bg-background"
          : "h-12 transition-[width,height] ease-linear"
      )}
    >
      {content === "menubar" ? <AppMenubar /> : <PageBreadcrumbs />}
    </header>
  )
}
