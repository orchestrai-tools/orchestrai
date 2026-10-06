import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The one header every page uses: title and a short count on the left, view
 * controls and the page's own actions on the right. The same kind of page
 * has the same header (Linear), so actions are always found in one place.
 */
export function PageToolbar({
  title,
  meta,
  children,
  className,
}: {
  title: string
  meta?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}

/** A quiet section label inside a page, grouping by space rather than by boxes. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-xs font-medium text-muted-foreground", className)}>{children}</h2>
}
