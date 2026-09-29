import { ExternalLink } from "lucide-react";

import { relativeTime } from "@/components/backlog/BacklogRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openExternalLink } from "@/lib/externalLinks";
import type { ItemRun } from "@/protocol";

import { formatCost, OUTCOME_META } from "./labels";

interface FactoryRunsProps {
  runs: ItemRun[];
  liveTaskIds: ReadonlySet<string>;
  onOpenTask: (taskId: string) => void;
}

/**
 * Recent attempts, newest first: how each ended, what it cost and where its
 * pull request is.
 *
 * @param props.runs Attempts as the daemon recorded them.
 * @param props.liveTaskIds Tasks that still exist, so a deleted one is not offered.
 * @param props.onOpenTask Opens an attempt's pipeline task.
 */
export function FactoryRuns({ runs, liveTaskIds, onOpenTask }: FactoryRunsProps) {
  return (
    <section>
      <h3 className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Recent runs
      </h3>
      {runs.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground/70">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-rule rounded-md border border-rule">
          {runs.map((run) => {
            const meta = OUTCOME_META[run.outcome];
            return (
              <li key={run.id} className="flex min-h-10 items-center gap-3 px-3 py-1 text-[13px]">
                <span className="tnum w-10 shrink-0 text-muted-foreground">#{run.itemNumber}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{run.itemTitle}</div>
                  {run.detail && (
                    <div className="truncate text-[11px] text-muted-foreground" title={run.detail}>
                      {run.detail}
                    </div>
                  )}
                </div>
                <Badge variant={meta.tone}>{meta.label}</Badge>
                <span className="tnum hidden w-20 shrink-0 text-right text-[11px] text-muted-foreground md:block">
                  {run.rounds} round{run.rounds === 1 ? "" : "s"}
                </span>
                <span
                  className="tnum w-24 shrink-0 text-right text-[11px] text-muted-foreground"
                  title="What the stage agents reported"
                >
                  {formatCost(run.costUsd)}
                </span>
                <span
                  className="tnum w-16 shrink-0 text-right text-[11px] text-muted-foreground"
                  title={new Date(run.dispatchedAt * 1000).toLocaleString()}
                >
                  {relativeTime(run.dispatchedAt * 1000)}
                </span>
                {run.prUrl ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Open pull request for #${run.itemNumber}`}
                    onClick={() => void openExternalLink(run.prUrl!)}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                {run.taskId && liveTaskIds.has(run.taskId) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[12px]"
                    onClick={() => onOpenTask(run.taskId!)}
                  >
                    Task
                  </Button>
                ) : (
                  <span className="w-[3.25rem] shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
