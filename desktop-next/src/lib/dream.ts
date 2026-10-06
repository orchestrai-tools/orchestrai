import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import type { PaletteAction } from "./task-palette";
import { useShell } from "./shell-store";

export interface DreamOutcome {
  inserted: number;
  pending: number;
  taskId: string | null;
  project: string | null;
}

/** Run dreaming and, for a real sweep, start a task that checks the proposals. */
export async function runDream(project: string | null, dryRun: boolean): Promise<DreamOutcome> {
  const snapshot = daemon.getState().snapshot;
  const target = project || snapshot.projects[0]?.name || null;
  const result = await daemon.memoryDream(dryRun, target);
  const counts = dreamCounts(result);
  if (dryRun || !target) return { ...counts, taskId: null, project: target };
  const agent = (snapshot.agents ?? []).find((item) => item.enabled)?.id;
  if (!agent) return { ...counts, taskId: null, project: target };
  const taskId = await daemon.taskCreate({
    project: target,
    agent,
    tags: ["dreaming"],
    worktree: false,
    prompt: dreamPrompt(target, result),
  });
  return { ...counts, taskId, project: target };
}

export function dreamCounts(result: unknown): { inserted: number; pending: number } {
  if (!result || typeof result !== "object") return { inserted: 0, pending: 0 };
  const row = result as { inserted?: unknown; pending?: unknown };
  return {
    inserted: typeof row.inserted === "number" ? row.inserted : 0,
    pending: typeof row.pending === "number" ? row.pending : 0,
  };
}

export function dreamSummary(outcome: DreamOutcome): string {
  const task = outcome.taskId ? " A task is checking the proposals." : "";
  return `${outcome.inserted} new, ${outcome.pending} pending.${task}`;
}

/** Run a dream, report the counts, and open the check task for a real sweep. */
export function startDream(project: string | null, dryRun: boolean) {
  void runDream(project, dryRun)
    .then((outcome) => {
      if (!dryRun && outcome.taskId && outcome.project)
        useShell.getState().openTask(outcome.taskId, outcome.project);
      const summary = dreamSummary(outcome);
      toast.success(dryRun ? `Dry run — ${summary}` : summary);
    })
    .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not dream"));
}

/** Dream for the open project from the command palette. */
export function dreamPaletteActions(project: string | null): PaletteAction[] {
  return [
    { id: "dream", label: "Dream now", run: () => startDream(project, false) },
    { id: "dream-dry", label: "Dream dry run", run: () => startDream(project, true) },
  ];
}

function dreamPrompt(project: string, result: unknown): string {
  const body = JSON.stringify(result).slice(0, 3000);
  return [
    `Dreaming just ran for ${project}: ${body}`,
    "",
    "Verify each proposal against the codebase. Say what is stale, duplicate, or a contradiction, and what is a false positive.",
    "Leave the proposals pending. Do not apply them.",
  ].join("\n");
}
