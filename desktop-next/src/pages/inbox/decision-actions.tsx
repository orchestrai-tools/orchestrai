import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@warpforge/ui/components/popover";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { permissionOutcome, type PermissionWire } from "../../lib/attention-notice";
import { isTypingTarget } from "../../lib/editor-nav";
import { CheckoutHeldActions } from "./checkout-held-actions";

const OUTCOME_LABEL: Record<PermissionWire, string> = {
  allow: "Approve once",
  allow_always: "Always for this task",
  deny: "Deny",
};

function fail(message: string) {
  return (err: unknown) => toast.error(err instanceof Error ? err.message : message);
}

/** The newest unanswered permission on the task, folded into its tool call by the client. */
export function usePendingPermission(task: TaskInfo, updates: SessionUpdate[]) {
  const pending = [...updates]
    .reverse()
    .find((update) => update.kind === "tool_call" && update.pendingPermission);
  const call = pending?.kind === "tool_call" ? pending : undefined;
  const requestId = call?.pendingPermission?.request_id;

  useEffect(() => {
    if (!task.pendingPermission || requestId) return;
    void daemon.loadSessionHistory(task.id);
  }, [task.id, task.pendingPermission, requestId]);

  return {
    requestId,
    title: call?.title,
    options: call?.pendingPermission?.options ?? ["allow", "reject"],
  };
}

/** Allow, always, or deny, as the agent offered them. With `keys`, A approves and D denies. */
export function PermissionButtons({
  task,
  updates,
  compact = false,
  keys = false,
  onDone,
}: {
  task: TaskInfo;
  updates: SessionUpdate[];
  compact?: boolean;
  keys?: boolean;
  onDone?: () => void;
}) {
  const { requestId, options } = usePendingPermission(task, updates);
  const allow = options.find((option) => permissionOutcome(option) === "allow");
  const deny = options.find((option) => permissionOutcome(option) === "deny");

  async function answer(option: string) {
    if (!requestId) {
      toast.error("The permission request has not loaded yet");
      return;
    }
    const outcome = permissionOutcome(option);
    if (!outcome) {
      toast.error("Answer this request in the task");
      return;
    }
    try {
      await daemon.request("session.permission", {
        task_id: task.id,
        request_id: requestId,
        outcome,
      });
      onDone?.();
    } catch (err) {
      fail("Could not answer")(err);
    }
  }

  useEffect(() => {
    if (!keys || !requestId) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const option = event.key === "a" ? allow : event.key === "d" ? deny : undefined;
      if (!option) return;
      event.preventDefault();
      void answer(option);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!task.pendingPermission) return null;
  return (
    <div className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-2")}>
      {options.map((option) => {
        const outcome = permissionOutcome(option);
        const label = outcome ? OUTCOME_LABEL[outcome] : option;
        const primary = option === allow;
        const negative = outcome === "deny";
        return (
          <Button
            key={option}
            size={compact ? "xs" : "sm"}
            variant={primary ? "default" : negative ? "ghost" : "outline"}
            disabled={!requestId}
            className={cn(negative && "text-destructive", negative && !compact && "ml-auto")}
            onClick={(event) => {
              event.stopPropagation();
              void answer(option);
            }}
          >
            {compact && outcome === "allow_always" ? "Always" : label}
            {keys && primary && (
              <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                A
              </Kbd>
            )}
            {keys && option === deny && <Kbd>D</Kbd>}
          </Button>
        );
      })}
      {!requestId && <span className="text-xs text-muted-foreground">Loading the request…</span>}
    </div>
  );
}

function QuestionForm({
  task,
  onDone,
  autoFocus,
}: {
  task: TaskInfo;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const waiting = task.workflowRun?.waiting;
  const [text, setText] = useState("");
  if (waiting?.kind !== "question") return null;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const message = text.trim();
        if (!message) return;
        void daemon.workflowReply(task.id, message, waiting.barrierId ?? undefined).then(() => {
          setText("");
          onDone?.();
        }, fail("Could not send the answer"));
      }}
    >
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Reply in your own words…"
        aria-label="Answer"
        autoFocus={autoFocus}
        className="min-h-14"
      />
      <Button type="submit" size="sm" disabled={!text.trim()} className="self-start">
        Send answer
      </Button>
    </form>
  );
}

/** A workflow's question, answered in place. Compact puts the box in a popover for list rows. */
export function QuestionReply({
  task,
  compact = false,
  onDone,
}: {
  task: TaskInfo;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (task.workflowRun?.waiting?.kind !== "question") return null;
  if (!compact) return <QuestionForm task={task} onDone={onDone} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" onClick={(event) => event.stopPropagation()}>
          Answer…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {task.workflowRun.waiting.question && (
          <p className="text-sm">{task.workflowRun.waiting.question}</p>
        )}
        <QuestionForm
          task={task}
          autoFocus
          onDone={() => {
            setOpen(false);
            onDone?.();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A pipeline at its round limit asks for one more round or a stop; a paused one only needs resuming. */
export function WorkflowDecision({
  task,
  compact = false,
  onDone,
}: {
  task: TaskInfo;
  compact?: boolean;
  onDone?: () => void;
}) {
  const waiting = task.workflowRun?.waiting;
  const size = compact ? "xs" : "sm";
  const barrierId = waiting?.barrierId ?? undefined;
  const done = () => onDone?.();
  if (waiting?.kind === "limit") {
    return (
      <div className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-2")}>
        <Button
          size={size}
          onClick={(event) => {
            event.stopPropagation();
            void daemon
              .workflowDecide(task.id, "extend", { barrierId, rounds: 1 })
              .then(done, fail("Could not extend"));
          }}
        >
          One more round
        </Button>
        <Button
          size={size}
          variant="ghost"
          className="text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            void daemon
              .workflowDecide(task.id, "stop", { barrierId })
              .then(done, fail("Could not stop"));
          }}
        >
          Stop
        </Button>
      </div>
    );
  }
  if (waiting?.kind === "paused") {
    return (
      <Button
        size={size}
        variant="outline"
        onClick={(event) => {
          event.stopPropagation();
          void daemon.workflowResume(task.id).then(done, fail("Could not resume"));
        }}
      >
        Resume
      </Button>
    );
  }
  return null;
}

/** Inline allow, deny, answer, and resume for a task that is waiting. */
export function DecisionActions({
  task,
  updates,
  compact = false,
  onDone,
}: {
  task: TaskInfo;
  updates: SessionUpdate[];
  compact?: boolean;
  onDone?: () => void;
}) {
  return (
    <>
      <PermissionButtons task={task} updates={updates} compact={compact} onDone={onDone} />
      <QuestionReply task={task} compact={compact} onDone={onDone} />
      <WorkflowDecision task={task} compact={compact} onDone={onDone} />
      <CheckoutHeldActions task={task} compact={compact} />
    </>
  );
}
