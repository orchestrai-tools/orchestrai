import { relativeTime } from "@/components/backlog/BacklogRow";
import { statusLabel, taskStatusVisual } from "@/lib/statusMeta";
import { cn } from "@/lib/utils";
import type { TaskInfo } from "@/protocol";

const TASK_TONE: Record<string, string> = {
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground/60",
  ok: "bg-ok",
  warn: "bg-warn",
};

/**
 * What became of this item, when it became something. Enough to decide whether
 * opening the task is worth the trip; the task screen has the rest.
 */
export function LinkedTaskSummary({ task }: { task: TaskInfo }) {
  const visual = taskStatusVisual(task.status);
  return (
    <div className="flex min-w-0 max-w-[80ch] items-center gap-2 rounded-md border border-border bg-background/30 px-3 py-2 text-[13px]">
      <span className={cn("size-1.5 shrink-0 rounded-full", TASK_TONE[visual.tone])} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-foreground">{task.title || task.prompt}</span>
      <span className="shrink-0 text-muted-foreground">{statusLabel(task.status)}</span>
      {task.filesChanged > 0 && (
        <span className="tnum shrink-0 text-muted-foreground/70">
          {task.filesChanged} file{task.filesChanged === 1 ? "" : "s"}
        </span>
      )}
      <span className="tnum shrink-0 text-muted-foreground/70">
        {relativeTime(task.updatedAt * 1000)}
      </span>
    </div>
  );
}
