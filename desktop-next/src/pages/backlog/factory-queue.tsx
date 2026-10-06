import { daemon } from "@warpforge/daemon";
import type { RunnerEntry, RunnerStatus } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { cn } from "@warpforge/ui/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { SectionLabel } from "../../components/common/page-toolbar";
import { openExternalLink } from "../../lib/external-link";
import { useShell } from "../../lib/shell-store";
import { queuedOrder, waitLabel } from "../../model/factory";
import { ago, OUTCOME_DOT, OUTCOME_LABEL } from "./labels";
import type { Factory } from "./use-backlog";

const STATE_LABEL: Record<RunnerEntry["state"], string> = {
  queued: "Queued",
  running: "Running",
  delivering: "Opening PR",
  delivered: "Delivered",
};

/** The Factory's order, what each queued task waits on, and the runs that finished. */
export function FactoryQueueDialog({
  project,
  factory,
  open,
  onClose,
}: {
  project: string;
  factory: Factory;
  open: boolean;
  onClose: () => void;
}) {
  const { entries, runs, status } = factory;
  const order = queuedOrder(entries);

  async function act(work: Promise<RunnerStatus | unknown>, done: string) {
    try {
      await work;
      toast.success(done);
      factory.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the queue");
    }
  }

  function move(taskId: string, by: number) {
    const index = order.indexOf(taskId);
    const next = index + by;
    if (index < 0 || next < 0 || next >= order.length) return;
    const ids = [...order];
    ids.splice(index, 1);
    ids.splice(next, 0, taskId);
    void act(daemon.runnerReorder(project, ids), "Moved the task");
  }

  const openTask = (taskId: string) => {
    onClose();
    useShell.getState().openTask(taskId, project);
  };
  const hold = waitLabel(status?.hold);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Factory queue</DialogTitle>
          <DialogDescription>
            {hold ? `Waiting: ${hold}.` : "Queued tasks start in this order as slots free up."}
            {status ? ` ${status.dispatchedToday} started in the last 24 hours.` : ""}
          </DialogDescription>
        </DialogHeader>
        {factory.error && (
          <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            {factory.error}
            <Button variant="outline" size="xs" onClick={factory.reload}>
              Retry
            </Button>
          </p>
        )}
        <section className="flex flex-col gap-1">
          <SectionLabel className="pb-1">In the Factory</SectionLabel>
          {entries.length === 0 && <p className="text-xs text-muted-foreground">Nothing queued.</p>}
          <ol className="-mx-2 flex flex-col">
            {entries.map((entry) => {
              const index = order.indexOf(entry.taskId);
              const waiting = waitLabel(entry.wait);
              return (
                <li key={entry.taskId} className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) text-sm hover:bg-muted">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {entry.number ? `#${entry.number}` : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {STATE_LABEL[entry.state]}
                      {waiting ? ` · ${waiting}` : ""}
                      {entry.workflow ? ` · ${entry.workflow}` : ""}
                      {entry.deliver ? "" : " · no PR"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {entry.state === "queued" && (
                      <>
                        <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={index <= 0} onClick={() => move(entry.taskId, -1)}>
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={index < 0 || index >= order.length - 1}
                          onClick={() => move(entry.taskId, 1)}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          title="Starts past slots, open PRs, the daily cap, disk and headroom"
                          onClick={() => void act(daemon.runnerStartNow(project, entry.taskId), "Started the task")}
                        >
                          Start now
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => void act(daemon.runnerDequeue(project, entry.taskId), "Removed from the queue")}>
                          Remove
                        </Button>
                      </>
                    )}
                    {entry.state === "delivered" && (
                      <>
                        {entry.prUrl && (
                          <Button size="xs" variant="ghost" onClick={() => void openExternalLink(entry.prUrl ?? "")}>
                            PR #{entry.prNumber}
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" onClick={() => void act(daemon.runnerRetry(project, entry.taskId), "Queued another run")}>
                          Retry
                        </Button>
                      </>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => openTask(entry.taskId)}>
                      Open
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="flex flex-col gap-1">
          <SectionLabel className="pb-1">History</SectionLabel>
          {runs.length === 0 && <p className="text-xs text-muted-foreground">No finished runs.</p>}
          <ol className="-mx-2 flex flex-col">
            {runs.slice(0, 12).map((run) => (
              <li key={run.id} className="flex items-center gap-2 px-2 py-(--row-py) text-sm">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", OUTCOME_DOT[run.outcome])} />
                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">#{run.itemNumber}</span>
                <span className="min-w-0 flex-1 truncate" title={run.detail ?? undefined}>
                  {run.itemTitle}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {OUTCOME_LABEL[run.outcome]}
                  {run.costUsd != null ? ` · $${run.costUsd.toFixed(2)}` : ""} · {ago(run.finishedAt ?? run.dispatchedAt)}
                </span>
                {run.prUrl && (
                  <Button size="icon-xs" variant="ghost" aria-label={`Open PR #${run.prNumber}`} onClick={() => void openExternalLink(run.prUrl ?? "")}>
                    <ExternalLinkIcon />
                  </Button>
                )}
                {run.taskId && (
                  <Button size="xs" variant="ghost" onClick={() => openTask(run.taskId ?? "")}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </section>
      </DialogContent>
    </Dialog>
  );
}
