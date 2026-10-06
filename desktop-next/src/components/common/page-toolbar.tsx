import { cn } from "@warpforge/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The one header every page uses: title and a short count on the left, view
 * controls and the page's own actions on the right. The same kind of page
 * has the same header, so actions are always found in one place.
 */
export function PageToolbar({
  title,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {meta != null && meta !== false && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** A quiet section label inside a page, grouping by space rather than by boxes. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-xs font-medium text-muted-foreground", className)}>{children}</h2>;
}

/** The padded column a page's content sits in. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-6 p-4 md:p-6", className)}>{children}</div>;
}
