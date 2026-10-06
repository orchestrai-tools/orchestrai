import type { WorkflowMeta } from "@warpforge/protocol";
import type { ReactNode } from "react";
import type { WorkflowNotes } from "../../lib/workflow-notes";

const KIND_DOES: Record<string, string> = {
  plan: "Writes a plan before anything changes.",
  implement: "Makes the change.",
  review: "Reads the diff and reports findings.",
  fix: "Works through the review's findings.",
  verify: "Tests the change in the running app.",
  merge: "Merges the work.",
};

const ON_LIMIT: Record<string, string> = {
  ask: "Asks you whether to extend or finish",
  finish: "Finishes, with open findings in the summary",
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** `review×2` is the review stage with its round count folded in. */
function parseStage(stage: string) {
  const [kind, rounds] = stage.split("×");
  return { kind: kind.trim(), rounds: rounds ? Number(rounds) : null };
}

/** The recipe as a vertical list, in the order the engine runs it. */
export function StepList({ workflow, notes }: { workflow: WorkflowMeta; notes: WorkflowNotes | null }) {
  const stages = workflow.stages ?? [];
  if (!stages.length) return <p className="text-xs text-muted-foreground">The daemon lists no stages for this workflow.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Stages run in order and each is a child task with its own session. A stage can stop to ask one question it cannot answer
        itself; the run waits on that stage until you reply.
      </p>
      <ol className="flex flex-col">
        {stages.map((stage, index) => {
          const { kind, rounds } = parseStage(stage);
          const agent = workflow.stageAgents?.[index];
          const maxRounds = rounds ?? workflow.maxRounds;
          return (
            <li key={`${stage}-${index}`} className="relative flex gap-3 pb-6 last:pb-0">
              {index < stages.length - 1 && <span aria-hidden className="absolute top-6 bottom-1 left-2.5 w-px bg-border" />}
              <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-sm font-medium capitalize">{kind}</h3>
                  {kind === "fix" && stages.some((other) => parseStage(other).kind === "review") && (
                    <span className="text-xs text-muted-foreground">⇄ back to review</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{agent ?? "Lead agent"}</span>
                </div>
                {KIND_DOES[kind] && <p className="mt-0.5 text-sm text-muted-foreground">{KIND_DOES[kind]}</p>}
                {kind === "review" && (
                  <dl className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    {notes && notes.reviewers.length > 0 && <Fact label="Reviewers">{notes.reviewers.join(", ")}</Fact>}
                    {maxRounds != null && maxRounds > 0 && (
                      <Fact label="Rounds">
                        Up to {maxRounds}. A fix runs between rounds, so {maxRounds} buys {Math.max(maxRounds - 1, 0)} fix
                        {maxRounds - 1 === 1 ? " attempt" : " attempts"}.
                      </Fact>
                    )}
                    {notes?.onLimit && <Fact label="At the limit">{ON_LIMIT[notes.onLimit] ?? notes.onLimit}</Fact>}
                  </dl>
                )}
                {kind === "verify" && workflow.verifyRequired != null && (
                  <dl className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <Fact label="Required">
                      {workflow.verifyRequired ? "Yes: no review without a pass" : "No: a failure is noted, then review"}
                    </Fact>
                  </dl>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
