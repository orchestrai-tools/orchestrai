import { cn } from "@warpforge/ui/lib/utils";

const COLORS = [
  "bg-sky-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-indigo-600",
  "bg-teal-600",
  "bg-fuchsia-600",
];

function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** The project's coloured initial, stable for its name. */
export function ProjectBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] leading-none font-semibold text-white",
        colorFor(name),
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Live status beside the name: what needs you first, else what is running. */
export function ProjectStatus({
  waiting,
  running,
  className,
}: {
  waiting: number;
  running: number;
  className?: string;
}) {
  const tone = waiting
    ? "text-amber-600 dark:text-amber-400"
    : running
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground";
  return (
    <span className={cn("flex shrink-0 items-center gap-1 tabular-nums", tone, className)}>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", waiting || running ? "bg-current" : "bg-muted-foreground/50")}
      />
      {waiting ? `${waiting} need you` : running ? `${running} running` : "idle"}
    </span>
  );
}
