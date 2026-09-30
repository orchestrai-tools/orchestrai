import { Clock, ExternalLink, Loader2, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { daemon } from "@/daemon";
import { runAgain, useFactoryEntry } from "@/hooks/useRunner";
import { useTaskPullRequest } from "@/hooks/useTaskPullRequest";
import { openExternalLink } from "@/lib/externalLinks";
import { canRunAgain, factoryWait, waitSentence } from "@/lib/factory";
import type { TaskInfo } from "@/protocol";

const BUTTON = "h-6 gap-1 px-2 text-[13px]";

/**
 * What the Factory is doing with this task, above its pipeline controls:
 * queued and why, opening its PR, the PR in review, or Run again after a
 * failed or stopped run.
 * @param props.task A Factory task.
 */
export function FactoryStrip({ task }: { task: TaskInfo }) {
  const { entry, status } = useFactoryEntry(task);
  const pr = useTaskPullRequest(task.id);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (error) {
      toast.error(`Could not ${label}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  let content: React.ReactNode = null;
  if (entry?.state === "queued") {
    const wait = factoryWait(entry, status);
    content = (
      <>
        <Clock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">Queued</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {wait ? waitSentence(wait) : "next in line"}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className={BUTTON}
            disabled={busy !== null}
            title="Start it now, past the project's Factory limits"
            onClick={() =>
              void act("start the task", () => daemon.runnerStartNow(task.project, task.id))
            }
          >
            <Play className="size-3" />
            Start now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={BUTTON}
            disabled={busy !== null}
            onClick={() =>
              void act("remove the task", () => daemon.runnerDequeue(task.project, task.id))
            }
          >
            <X className="size-3" />
            Remove from queue
          </Button>
        </span>
      </>
    );
  } else if (entry?.state === "delivering") {
    content = (
      <>
        <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        <span className="text-foreground">Opening PR…</span>
      </>
    );
  } else if (entry?.state === "delivered") {
    const url = entry.prUrl ?? pr?.url ?? null;
    const number = entry.prNumber ?? pr?.number ?? null;
    content = (
      <>
        <span className="font-medium text-foreground">{number ? `PR #${number}` : "Draft PR"}</span>
        <span className="text-muted-foreground">Ready for review</span>
        {url && (
          <Button
            size="sm"
            variant="ghost"
            className={`${BUTTON} ml-auto`}
            onClick={() => void openExternalLink(url)}
          >
            <ExternalLink className="size-3" />
            Open PR
          </Button>
        )}
      </>
    );
  } else if (!entry && canRunAgain(task)) {
    content = (
      <>
        <span className="text-muted-foreground">
          {task.status === "interrupted"
            ? "This Factory run was stopped."
            : "This Factory run failed."}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className={`${BUTTON} ml-auto`}
          disabled={busy !== null}
          title="Start a new Factory task with the same configuration"
          onClick={() => void act("run it again", () => runAgain(task))}
        >
          <RotateCcw className="size-3" />
          Run again
        </Button>
      </>
    );
  }
  if (!content) return null;
  return (
    <div
      data-testid="factory-strip"
      className="flex shrink-0 items-center gap-2 border-t border-rule px-3 py-2 text-[13px]"
    >
      {content}
    </div>
  );
}
