import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { daemon } from "@/daemon";
import { runnerStatusKey } from "@/hooks/useRunner";
import { openExternalLink } from "@/lib/externalLinks";
import type { RunnerEntry } from "@/protocol";

import { ENTRY_STATE_LABEL } from "./labels";

interface FactoryQueueProps {
  project: string;
  entries: RunnerEntry[];
  onOpenTask: (taskId: string) => void;
}

/**
 * The Factory's queue in start order, then the items in flight or in review.
 * Order moves within one priority: priority always wins over position.
 *
 * @param props.project The project the queue belongs to.
 * @param props.entries Entries as the daemon orders them.
 * @param props.onOpenTask Opens an item's pipeline task.
 */
export function FactoryQueue({ project, entries, onOpenTask }: FactoryQueueProps) {
  const queryClient = useQueryClient();
  const queued = entries.filter((entry) => entry.state === "queued");
  const active = entries.filter((entry) => entry.state !== "queued");

  const act = async (work: () => Promise<unknown>, failure: string) => {
    try {
      const status = await work();
      queryClient.setQueryData(runnerStatusKey(project), status);
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = queued.map((entry) => entry.itemId);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    void act(() => daemon.runnerReorder(project, ids), "Could not reorder the queue");
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="In progress" empty="Nothing is running.">
        {active.map((entry) => (
          <li key={entry.itemId} className="flex h-10 items-center gap-3 px-3 text-[13px]">
            <span className="tnum w-10 shrink-0 text-muted-foreground">#{entry.number}</span>
            <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            <Badge variant={entry.state === "delivered" ? "ok" : "outline"}>
              {ENTRY_STATE_LABEL[entry.state]}
            </Badge>
            {entry.prUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[12px]"
                onClick={() => void openExternalLink(entry.prUrl!)}
              >
                <ExternalLink className="size-3.5" />
                PR {entry.prNumber ? `#${entry.prNumber}` : ""}
              </Button>
            )}
            {entry.taskId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[12px]"
                onClick={() => onOpenTask(entry.taskId!)}
              >
                Open pipeline
              </Button>
            )}
          </li>
        ))}
      </Section>

      <Section title="Queue" empty="No items are queued. Use Run in Factory on a backlog item.">
        {queued.map((entry, index) => {
          const samePriorityAbove = queued[index - 1]?.priority === entry.priority;
          const samePriorityBelow = queued[index + 1]?.priority === entry.priority;
          return (
            <li
              key={entry.itemId}
              className="flex min-h-10 items-center gap-3 px-3 py-1 text-[13px]"
            >
              <span className="tnum w-10 shrink-0 text-muted-foreground">#{entry.number}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{entry.title}</div>
                {entry.waitingReason && (
                  <div className="truncate text-[11px] text-warn" title={entry.waitingReason}>
                    Waiting: {entry.waitingReason}
                  </div>
                )}
              </div>
              {entry.priority !== "none" && (
                <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                  {entry.priority}
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Move #${entry.number} up`}
                disabled={!samePriorityAbove}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Move #${entry.number} down`}
                disabled={!samePriorityBelow}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label={`Remove #${entry.number} from the queue`}
                onClick={() =>
                  void act(
                    () => daemon.runnerDequeue(project, entry.itemId),
                    "Could not remove the item",
                  )
                }
              >
                <X className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h3 className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground/70">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule rounded-md border border-rule">{children}</ul>
      )}
    </section>
  );
}
