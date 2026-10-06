import { daemon } from "@warpforge/daemon";
import type { RunnerEntry, TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { openExternalLink } from "../../lib/external-link";
import { useShell } from "../../lib/shell-store";
import { canRunAgain, isFactoryTask, waitLabel } from "../../model/factory";
import { Frame } from "./attention-card";

/** What Factory is doing with this task: queued, opening a pull request, delivered, or ready to run again. */
export function FactoryNotice({ task, pull }: { task: TaskInfo; pull?: TaskPullRequest }) {
  const [entry, setEntry] = useState<RunnerEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const factory = isFactoryTask(task);

  useEffect(() => {
    if (!factory) return;
    void daemon
      .runnerStatus(task.project)
      .then((status) => {
        setEntry(status.entries.find((item) => item.taskId === task.id) ?? null);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load the queue"),
      );
  }, [factory, task.id, task.project, task.status, reload]);

  if (!factory) return null;

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${label}`);
    } finally {
      setBusy(false);
      setReload((count) => count + 1);
    }
  }

  if (error && !entry) {
    return (
      <Frame tone="red" label="Factory">
        <p className="text-sm">{error}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setReload((count) => count + 1)}>
            Retry
          </Button>
        </div>
      </Frame>
    );
  }
  if (entry?.state === "queued") {
    return (
      <Frame tone="neutral" label="Queued in the Factory">
        <p className="text-sm">{waitLabel(entry.wait) ?? "Next in line"}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void act("start", () => daemon.runnerStartNow(task.project, task.id))}
          >
            Start now
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act("remove", () => daemon.runnerDequeue(task.project, task.id))}
          >
            Remove from queue
          </Button>
        </div>
      </Frame>
    );
  }
  if (entry?.state === "delivering") {
    return (
      <Frame tone="sky" role="status" label="Factory">
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
          Opening a pull request…
        </p>
      </Frame>
    );
  }
  if (entry?.state === "delivered") {
    const url = entry.prUrl ?? pull?.url ?? null;
    const number = entry.prNumber ?? pull?.number ?? null;
    return (
      <Frame
        tone="sky"
        label={
          number
            ? `Pull request #${number} is ready for review`
            : "Draft pull request is ready for review"
        }
      >
        {url && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void openExternalLink(url)}>
              <ExternalLinkIcon />
              Open pull request
            </Button>
          </div>
        )}
      </Frame>
    );
  }
  if (!entry && canRunAgain(task)) {
    return (
      <Frame
        tone="red"
        label={
          task.status === "interrupted" ? "This Factory run was stopped" : "This Factory run failed"
        }
      >
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act("run again", async () => {
                const result = await daemon.runnerRetry(task.project, task.id);
                const created = result.created[0];
                if (created) useShell.getState().openTask(created.taskId, task.project);
                toast.success("Queued another run");
              })
            }
          >
            Run again
          </Button>
        </div>
      </Frame>
    );
  }
  return null;
}
