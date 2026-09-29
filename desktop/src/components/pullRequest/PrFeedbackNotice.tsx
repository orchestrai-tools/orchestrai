import { GitPullRequest } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { daemon } from "@/daemon";
import { useTaskPullRequest } from "@/hooks/useTaskPullRequest";
import { useWorkflowSend } from "@/hooks/useWorkflowSend";
import { formatPrFeedbackPrompt, pendingPrFeedback, prFeedbackSummary } from "@/lib/prFeedback";
import { cn } from "@/lib/utils";
import type { TaskInfo } from "@/protocol";
import { usePrFeedbackStore } from "@/store/prFeedback";

const NONE: readonly string[] = [];

/**
 * The task's pull request came back with failing checks or review comments
 * the agent has not been told about. Sending delivers them as one prompt into
 * this task's own session, or a finished pipeline's last code-changing stage;
 * a busy agent queues it (ADR 0011).
 * @param props.task The open task.
 * @returns The notice, or nothing when there is nothing new.
 */
export function PrFeedbackNotice({ task }: { task: TaskInfo }) {
  const pr = useTaskPullRequest(task.id);
  const handled = usePrFeedbackStore((state) => state.handledByTask[task.id] ?? NONE);
  const record = usePrFeedbackStore((state) => state.record);
  const { handoff, send: sendToWorkflow, undeliverable } = useWorkflowSend(task);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedback = useMemo(() => pendingPrFeedback(pr, handled), [handled, pr]);

  if (!pr || !feedback || task.status === "done") return null;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const submission = { attachments: [], text: formatPrFeedbackPrompt(pr, feedback) };
      if (!(await sendToWorkflow(submission))) {
        await daemon.request("session.prompt", { task_id: task.id, ...submission });
      }
      record(task.id, feedback.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const busy = task.status === "running" || task.status === "queued";
  const hint = undeliverable
    ? `${undeliverable}.`
    : handoff
      ? `Goes to the ${handoff.label} stage (${handoff.agent}), the last to change the code. The pipeline does not review it again.`
      : busy
        ? "The agent is working; this waits until its turn ends."
        : "Hand them to the agent that opened it, in this conversation.";

  return (
    <div
      data-pr-feedback
      className="flex items-start gap-2 border-b border-rule bg-warn/10 px-4 py-2 text-[13px]"
    >
      <GitPullRequest aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          PR #{pr.number}: {prFeedbackSummary(feedback)}
        </p>
        <p className={cn("mt-0.5", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0"
        disabled={sending}
        onClick={() => record(task.id, feedback.keys)}
      >
        Dismiss
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={sending || !!undeliverable}
        onClick={() => void send()}
      >
        Send to agent
      </Button>
    </div>
  );
}
