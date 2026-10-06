import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useState } from "react";
import {
  formatPrFeedbackPrompt,
  pendingPrFeedback,
  prFeedbackSummary,
  usePrFeedback,
} from "../../lib/pr-feedback";
import { useDaemon } from "../../lib/use-daemon";

const NONE: readonly string[] = [];

/** Failing checks or new review comments on the task's pull request, sent to its agent or dismissed. */
export function PrFeedbackActions({ task, onDone }: { task: TaskInfo; onDone?: () => void }) {
  const pr = useDaemon().taskPullRequests?.[task.id] ?? null;
  const handled = usePrFeedback((state) => state.handledByTask[task.id] ?? NONE);
  const record = usePrFeedback((state) => state.record);
  const [error, setError] = useState("");
  const feedback = pendingPrFeedback(pr, handled);
  if (!pr || !feedback || task.status === "done") return null;

  async function send() {
    if (!pr || !feedback) return;
    setError("");
    try {
      await daemon.request("session.prompt", {
        task_id: task.id,
        text: formatPrFeedbackPrompt(pr, feedback),
        attachments: [],
      });
      record(task.id, feedback.keys);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the feedback");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <p className="text-sm">
        <span className="font-medium">Pull request #{pr.number}:</span>{" "}
        {prFeedbackSummary(feedback)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void send()}>
          Send to the agent
        </Button>
        <Button size="sm" variant="ghost" onClick={() => record(task.id, feedback.keys)}>
          Dismiss
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
