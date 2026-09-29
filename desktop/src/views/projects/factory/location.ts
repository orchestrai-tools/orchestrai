import type { EntryRunLocation, RunLocation, WorkflowMeta } from "@/protocol";

export type ResolvedLocation = Exclude<RunLocation, "auto">;

export const LOCATION_LABEL: Record<RunLocation, string> = {
  auto: "Auto",
  checkout: "Project checkout",
  worktree: "Worktree",
};

/**
 * Where an item runs, as the daemon resolves it at dispatch: its own choice,
 * else the project's, with `auto` taking the checkout for a workflow that
 * verifies.
 * @param project The project's run location setting.
 * @param entry The item's own choice.
 * @param workflow The workflow the item runs through, when known.
 * @returns `worktree` or `checkout`.
 */
export function resolveLocation(
  project: RunLocation,
  entry: EntryRunLocation,
  workflow: WorkflowMeta | undefined,
): ResolvedLocation {
  if (entry !== "default") return entry;
  if (project !== "auto") return project;
  return workflow?.verifyRequired == null ? "worktree" : "checkout";
}

/**
 * The label of the "follow the project" choice, naming what it means now.
 * @param project The project's run location setting.
 * @param workflow The workflow the item runs through, when known.
 * @returns For example "Project default (Worktree)".
 */
export function projectDefaultLabel(project: RunLocation, workflow?: WorkflowMeta): string {
  if (project !== "auto") return `Project default (${LOCATION_LABEL[project]})`;
  const resolved = LOCATION_LABEL[resolveLocation(project, "default", workflow)];
  return workflow ? `Project default (Auto: ${resolved.toLowerCase()})` : "Project default (Auto)";
}
