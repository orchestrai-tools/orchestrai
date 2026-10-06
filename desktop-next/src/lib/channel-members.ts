const ACTIVE = ["running", "blocked", "waiting", "queued"] as const;

const LABEL: Record<(typeof ACTIVE)[number], string> = {
  running: "Working on",
  blocked: "Blocked on",
  waiting: "Waiting on",
  queued: "Queued on",
};

/** What an enabled agent is doing in this project, from its own tasks. */
export function agentActivity(
  agentId: string,
  tasks: Array<{ id: string; agent: string; status: string; title?: string; prompt?: string }>,
): { text: string; taskId: string | null } {
  const mine = tasks.filter((task) => task.agent === agentId);
  for (const status of ACTIVE) {
    const task = mine.find((item) => item.status === status);
    if (!task) continue;
    const title = task.title || task.prompt || "a task";
    return { text: `${LABEL[status]} ${title}`, taskId: task.id };
  }
  return { text: "Idle", taskId: null };
}
