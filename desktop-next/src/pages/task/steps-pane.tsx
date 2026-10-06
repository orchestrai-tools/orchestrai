import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "../../components/common/page-toolbar";
import { Markdown } from "../../components/markdown";
import { latestVerification } from "../../lib/inspector-context";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { VerificationReport } from "./verification";

const STEP_TONE: Record<string, string> = {
  complete: "bg-foreground/50",
  completed: "bg-foreground/50",
  done: "bg-foreground/50",
  running: "bg-emerald-500",
  failed: "bg-red-500",
  error: "bg-red-500",
};

interface Step {
  id: string;
  label: string;
  detail?: string;
  state: string;
  taskId?: string | null;
}

/** The steps a run is made of — workflow stages, or the workers an orchestrator started. */
export function stepsOf(task: TaskInfo, tasks: TaskInfo[]): Step[] {
  const nodes = task.orchestrationGraph?.nodes ?? [];
  if (nodes.length > 0) {
    return nodes.map((node) => ({
      id: node.id,
      label: node.kind,
      detail: node.agent,
      state: node.status,
      taskId: node.taskId,
    }));
  }
  return tasks
    .filter((item) => item.parentTaskId === task.id && !item.origin)
    .map((child) => ({
      id: child.id,
      label: child.title || child.prompt,
      detail: child.agent,
      state: child.status,
      taskId: child.id,
    }));
}

function ChildTranscript({ updates, onClose }: { updates: SessionUpdate[]; onClose: () => void }) {
  const lines = updates.filter(
    (update) =>
      update.kind === "user_message" || update.kind === "agent_text" || update.kind === "tool_call",
  );
  return (
    <section className="flex flex-col gap-2 rounded-md border px-4 py-3">
      <div className="flex items-center">
        <SectionLabel>Step transcript</SectionLabel>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close the step transcript"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing recorded for this step yet.</p>
      )}
      <ol className="flex flex-col gap-2 text-sm">
        {lines.map((update, index) => (
          <li key={index}>
            {update.kind === "tool_call" ? (
              <p className="font-mono text-xs text-muted-foreground">
                {update.title} · {update.status}
              </p>
            ) : update.kind === "user_message" ? (
              <p className="font-medium whitespace-pre-wrap">{update.text}</p>
            ) : update.kind === "agent_text" ? (
              <Markdown>{update.text}</Markdown>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The step log: where the run is now, each step's verdict, the latest verification, and a read-only look into a step. */
export function StepsPane({ task }: { task: TaskInfo }) {
  const state = useDaemon();
  const run = task.workflowRun;
  const steps = stepsOf(task, state.snapshot.tasks);
  const [selected, setSelected] = useState<string | null>(null);
  const loaded = useRef(new Set<string>());
  const childUpdates = selected ? (state.sessionUpdates[selected] ?? []) : [];
  const verification = latestVerification(run?.verifications);
  const events = (state.sessionUpdates[task.id] ?? []).filter(
    (update): update is Extract<SessionUpdate, { kind: "workflow_event" }> =>
      update.kind === "workflow_event",
  );

  useEffect(() => {
    if (!selected || loaded.current.has(selected)) return;
    loaded.current.add(selected);
    void daemon.loadSessionHistory(selected);
  }, [selected]);

  if (steps.length === 0 && events.length === 0 && !run) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No steps yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {steps.length > 0 && (
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.id} className="group/step flex items-center gap-3 py-(--row-py) text-sm">
              <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STEP_TONE[step.state] ?? "bg-foreground/15",
                )}
              />
              <span
                className={cn(
                  "min-w-0 truncate",
                  step.state === "pending" && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {step.detail && (
                <span className="shrink-0 text-xs text-muted-foreground">{step.detail}</span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {step.taskId && (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-pressed={selected === step.taskId}
                      onClick={() => setSelected(step.taskId ?? null)}
                    >
                      Read
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        step.taskId && useShell.getState().openTask(step.taskId, task.project)
                      }
                    >
                      Open
                    </Button>
                  </>
                )}
                <span className="w-16 text-right text-xs text-muted-foreground">{step.state}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {selected && <ChildTranscript updates={childUpdates} onClose={() => setSelected(null)} />}
      {verification && <VerificationReport parentId={task.id} verification={verification} />}
      {events.length > 0 && (
        <section className="flex flex-col gap-1">
          <SectionLabel>Run events</SectionLabel>
          <ul className="flex flex-col text-sm">
            {events.map((update, index) => (
              <li key={index} className="py-0.5">
                {update.title}
                {update.detail && <span className="text-muted-foreground"> · {update.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {run?.report && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Report</SectionLabel>
          <Markdown>{run.report}</Markdown>
        </section>
      )}
    </div>
  );
}
