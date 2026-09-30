import { useFactoryEntry } from "@/hooks/useRunner";
import { useTaskPullRequest } from "@/hooks/useTaskPullRequest";
import { factoryStage, factoryWait, waitSentence } from "@/lib/factory";
import { cn } from "@/lib/utils";
import type { TaskInfo } from "@/protocol";

/**
 * Where a Factory task is, on its sidebar row: Queued (with why, on hover),
 * the stage it runs, Opening PR, or its pull request.
 * @param props.task A Factory task.
 * @param props.receded Whether the row is history.
 */
export function FactoryStageChip({ task, receded }: { task: TaskInfo; receded: boolean }) {
  const { entry, status } = useFactoryEntry(task);
  const pr = useTaskPullRequest(task.id);
  const label = factoryStage(task, entry, pr?.number);
  if (!label) return null;
  const wait = factoryWait(entry, status);
  const queued = label === "Queued";
  const title = queued
    ? `Queued — ${wait ? waitSentence(wait) : "next in line"}`
    : `Factory · ${label}`;
  return (
    <span
      data-factory-stage={label}
      title={title}
      className={cn(
        "max-w-[8.5rem] shrink-0 truncate rounded px-1 text-[11px] leading-4",
        queued ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
        receded && "opacity-50",
      )}
    >
      {label}
      <span className="sr-only">{queued ? ` — ${title}` : ""}</span>
    </span>
  );
}
