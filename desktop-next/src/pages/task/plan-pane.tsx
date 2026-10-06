import type { PlanEntry, SessionUpdate } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { Markdown } from "../../components/markdown";
import { planMark } from "../../lib/plan-mark";
import { useShell } from "../../lib/shell-store";

const STEP_TONE: Record<string, string> = {
  completed: "bg-foreground/50",
  in_progress: "bg-emerald-500",
};

/** A plan as done, current, and waiting steps, numbered like the step log. */
export function PlanList({ entries, className }: { entries: PlanEntry[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => {
        const mark = planMark(entry.status);
        return (
          <li
            key={`${index}:${entry.content}`}
            className="flex items-start gap-3 py-(--row-py) text-sm"
          >
            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span
              role="img"
              aria-label={mark.label}
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                STEP_TONE[entry.status] ?? "bg-foreground/15",
              )}
            />
            <span
              className={cn(
                "min-w-0 flex-1",
                mark.done && "text-muted-foreground line-through",
                entry.status === "pending" && "text-muted-foreground",
              )}
            >
              {entry.content}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The latest plan the agent wrote, done/total, for the tab label. */
export function latestPlan(updates: SessionUpdate[]): PlanEntry[] | null {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update.kind === "plan") return update.entries;
  }
  return null;
}

/**
 * The plan the agent is working to, as it last wrote it; a workflow that
 * never wrote one shows its final report instead.
 */
export function PlanPane({
  updates,
  report,
  known,
}: {
  updates: SessionUpdate[];
  report?: string | null;
  known: ReadonlySet<string>;
}) {
  const entries = latestPlan(updates);
  if (!entries && !report) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No plan has been written yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {entries && <PlanList entries={entries} />}
      {!entries && report && (
        <Markdown
          known={known}
          onOpenFile={(path, line) => useShell.getState().setFileJump({ path, line })}
        >
          {report}
        </Markdown>
      )}
    </div>
  );
}
