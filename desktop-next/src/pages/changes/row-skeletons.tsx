import { Skeleton } from "@warpforge/ui/components/skeleton";
import { cn } from "@warpforge/ui/lib/utils";

const WIDTHS = ["w-3/5", "w-2/5", "w-4/5", "w-1/2"];

/** Placeholder list rows while a list loads; `label` is what screen readers hear. */
export function RowSkeletons({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", WIDTHS[index % WIDTHS.length])} />
      ))}
    </div>
  );
}
