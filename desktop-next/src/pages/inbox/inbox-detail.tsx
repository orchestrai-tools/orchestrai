import type { SessionUpdate } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useDaemon } from "../../lib/use-daemon";
import { agentName, nowSec, taskTitle } from "../board/task-facts";
import { formatElapsed } from "../../lib/live-line";
import {
  PermissionButtons,
  QuestionReply,
  WorkflowDecision,
  usePendingPermission,
} from "./decision-actions";
import { KIND_LABEL, type InboxEntry } from "./inbox-items";
import { PrFeedbackActions } from "./pr-feedback-actions";

const NONE: SessionUpdate[] = [];

/** One request in full: what is asked, by whom, and the answers that unblock it. */
export function InboxDetail({
  entry,
  onResolve,
  onOpenTask,
}: {
  entry: InboxEntry;
  onResolve: () => void;
  onOpenTask: () => void;
}) {
  const state = useDaemon();
  const { task, kind } = entry;
  const updates = state.sessionUpdates[task.id] ?? NONE;
  const permission = usePendingPermission(task, updates);
  const question = task.workflowRun?.waiting?.question;
  const detail = kind === "question" && question ? question : entry.reason;

  return (
    <article className="flex flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {KIND_LABEL[kind]} · {task.project} · {formatElapsed(task.updatedAt, nowSec())} ago
        </p>
        <h2 className="text-base font-semibold">
          <button
            type="button"
            onClick={onOpenTask}
            className="text-left underline-offset-2 hover:underline"
          >
            {taskTitle(task)}
          </button>
        </h2>
        <p className="text-xs text-muted-foreground">
          {agentName(state.snapshot.agents, task.agent)}
        </p>
      </header>

      {kind === "permission" && permission.title && (
        <pre className="rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {permission.title}
        </pre>
      )}
      {detail && <p className="text-sm">{detail}</p>}

      {kind === "permission" && (
        <PermissionButtons task={task} updates={updates} keys onDone={onResolve} />
      )}

      {kind === "question" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-2 text-xs text-muted-foreground">Answer in your own words</legend>
          <QuestionReply task={task} onDone={onResolve} />
        </fieldset>
      )}

      {(kind === "decision" || task.workflowRun?.waiting?.kind === "paused") && (
        <WorkflowDecision task={task} onDone={onResolve} />
      )}

      <PrFeedbackActions task={task} onDone={onResolve} />

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onOpenTask}>
          Open task
        </Button>
      </div>
    </article>
  );
}
