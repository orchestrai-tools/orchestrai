import type { WorkflowMeta } from "@warpforge/protocol";

/** What Start will do, in one line, from the mode and the chosen workflow. */
export function runPreview({
  mode,
  agent,
  workflow,
  deliver,
}: {
  mode: "single" | "orchestrator" | "factory";
  agent: string;
  workflow: WorkflowMeta | null;
  deliver: boolean;
}): string {
  if (mode === "orchestrator") return `${agent} plans the work and hands pieces to other agents.`;
  if (mode === "factory") {
    if (!workflow) return "Pick a workflow to see how the Factory run is staged.";
    const stages = (workflow.stages ?? []).join(" → ");
    const rounds = workflow.maxRounds ? ` · ${workflow.maxRounds} review rounds` : "";
    const ending = deliver
      ? "A successful run opens a draft pull request."
      : "You review the change yourself.";
    return `${stages || workflow.name}${rounds}. ${ending}`;
  }
  return `${agent} works through the prompt in this task.`;
}
