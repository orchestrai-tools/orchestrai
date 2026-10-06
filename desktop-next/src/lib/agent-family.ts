import type { TaskInfo } from "@warpforge/protocol";

function parentId(task: TaskInfo, known: Set<string>): string | null {
  const parent = task.parentTaskId;
  if (!parent || task.origin || parent === task.id || !known.has(parent)) return null;
  return parent;
}

/** The lead and every worker under it, lead first. Advisors stay out. */
export function agentFamily(taskId: string, tasks: TaskInfo[]): TaskInfo[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let current = byId.get(taskId);
  if (!current) return [];
  const seen = new Set<string>();
  while (!seen.has(current.id)) {
    seen.add(current.id);
    const parent = parentId(current, new Set(byId.keys()));
    const next = parent ? byId.get(parent) : undefined;
    if (!next) break;
    current = next;
  }
  const root = current;
  const known = new Set(byId.keys());
  const family: TaskInfo[] = [];
  const walk = (task: TaskInfo) => {
    family.push(task);
    for (const child of tasks) {
      if (parentId(child, known) === task.id) walk(child);
    }
  };
  walk(root);
  return family;
}

export function memberLabel(member: TaskInfo, index: number, root: TaskInfo): string {
  if (index === 0) return root.workflowRun ? "Factory" : "Lead";
  const stage = root.orchestrationGraph?.nodes.find((node) => node.taskId === member.id)?.id;
  return stage ? `${stage} · ${member.agent}` : member.agent;
}

export function isLead(task: TaskInfo, workers: number): boolean {
  return task.tags.includes("orchestrator-chat") || workers > 0 || task.workflowRun != null;
}

export function childCount(taskId: string, tasks: TaskInfo[]): number {
  return tasks.filter((task) => task.parentTaskId === taskId && !task.origin).length;
}

export function childLabel(count: number, workflow: boolean, lead = false): string {
  if (count <= 0) return lead ? "Lead" : "";
  if (workflow) return count === 1 ? "1 stage" : `${count} stages`;
  return count === 1 ? "1 worker" : `${count} workers`;
}
