import { daemon } from "@warpforge/daemon";
import type { TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { activeAccountForAgent, formatResetRelative, worstWindow } from "../../lib/agent-limits";
import {
  formatPrFeedbackPrompt,
  pendingPrFeedback,
  prFeedbackSummary,
  usePrFeedback,
} from "../../lib/pr-feedback";
import { useDaemon } from "../../lib/use-daemon";
import { CheckoutHeldActions } from "../inbox/checkout-held-actions";
import { Frame } from "./attention-card";
import { FactoryNotice } from "./factory-notice";

const NONE: readonly string[] = [];

function QuotaNotice({ task }: { task: TaskInfo }) {
  const state = useDaemon();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const limits = state.agentLimits;
  const activeId =
    state.snapshot.accounts?.find((account) => account.agentId === task.agent && account.active)
      ?.id ?? null;
  const account = limits ? activeAccountForAgent(limits, task.agent, activeId) : null;
  const exhausted = account?.exhausted
    ? worstWindow(account.windows.filter((window) => window.usedPercent >= 100))
    : null;
  const key = account && exhausted ? `${account.accountId}:${exhausted.id}` : null;
  if (!account || !exhausted || !key || dismissed === key) return null;
  const suggestion = limits?.find(
    (item) =>
      item.agentId === task.agent &&
      item.accountId !== account.accountId &&
      !item.exhausted &&
      !item.error,
  );
  return (
    <Frame tone="red" role="alert" label={`${account.label}'s quota is spent`}>
      <p className="text-sm">
        The {exhausted.label.toLowerCase()} limit is exhausted, so new prompts will fail until the
        window clears.
        {exhausted.resetsAt != null
          ? ` It resets ${formatResetRelative(exhausted.resetsAt).replace(/^resets /, "")}.`
          : ""}
        {suggestion ? ` Another ${task.agent} account, ${suggestion.label}, still has quota.` : ""}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setDismissed(key)}>
          Dismiss
        </Button>
      </div>
    </Frame>
  );
}

function PrFeedbackNotice({ task, pull }: { task: TaskInfo; pull: TaskPullRequest | undefined }) {
  const handled = usePrFeedback((state) => state.handledByTask[task.id] ?? NONE);
  const record = usePrFeedback((state) => state.record);
  const [busy, setBusy] = useState(false);
  const feedback = pendingPrFeedback(pull, handled);
  if (!pull || !feedback || task.status === "done") return null;

  async function send() {
    if (!pull || !feedback) return;
    setBusy(true);
    try {
      await daemon.request("session.prompt", {
        task_id: task.id,
        text: formatPrFeedbackPrompt(pull, feedback),
        attachments: [],
      });
      record(task.id, feedback.keys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the feedback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame
      tone={feedback.checks.length > 0 ? "red" : "sky"}
      label={`New on pull request #${pull.number}`}
    >
      <p className="text-sm">{prFeedbackSummary(feedback)}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void send()}>
          Send to the agent
        </Button>
        <Button size="sm" variant="ghost" onClick={() => record(task.id, feedback.keys)}>
          Dismiss
        </Button>
      </div>
    </Frame>
  );
}

/**
 * What stands between this task and its next turn, under the header: a lost
 * session, a model the agent did not apply, a held checkout, any other block, a spent quota,
 * new pull request feedback, and the task's place in the Factory.
 */
export function TaskNotices({
  task,
  agentName,
  pull,
  canContinue,
  onContinue,
}: {
  task: TaskInfo;
  agentName: string;
  pull: TaskPullRequest | undefined;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <>
      {task.blockedKind === "session_lost" && (
        <Frame tone="red" role="alert" label={`${agentName} no longer has this session`}>
          <p className="text-sm">
            Its own history was deleted or expired, so it cannot be resumed. The conversation
            recorded here is intact and can seed a fresh session.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={!canContinue} onClick={onContinue}>
              Continue in a new session…
            </Button>
          </div>
        </Frame>
      )}
      {task.blockedKind === "model_mismatch" && (
        <Frame tone="amber" label="Not running on the requested model">
          <p className="text-sm">
            {task.blockedReason ?? "The requested model was not applied."} The session works, but on
            a different model.
          </p>
        </Frame>
      )}
      {task.blockedKind === "checkout_held" && (
        <Frame tone="amber" label="Checkout in use">
          <p className="text-sm">
            {task.blockedReason ??
              "The Factory could not switch your project folder back. Clean it, then try again."}
          </p>
          <CheckoutHeldActions task={task} />
        </Frame>
      )}
      {task.status === "blocked" && !task.blockedKind && task.blockedReason && (
        <Frame tone="red" role="alert" label="Blocked">
          <p className="text-sm break-words">{task.blockedReason}</p>
        </Frame>
      )}
      <QuotaNotice task={task} />
      <PrFeedbackNotice task={task} pull={pull} />
      <FactoryNotice task={task} pull={pull} />
    </>
  );
}
