import type { AdvisorPick, SessionUpdate, TaskInfo } from "@warpforge/protocol";

const nowSecs = () => Math.floor(Date.now() / 1000);

const firstLine = (text: string) => text.trim().split("\n")[0]?.trim().slice(0, 80) ?? "";

/** `task.create` in demo mode: the task, and what its transcript opens with. */
export function demoCreateTask(p: Record<string, unknown>): {
  task: TaskInfo;
  updates: SessionUpdate[];
} {
  const prompt = String(p.prompt ?? "");
  const start = p.start !== false;
  const task = {
    advisor: p.advisor ? { ...(p.advisor as AdvisorPick), consultations: 0 } : null,
    agent: String(p.agent ?? "claude"),
    backlogItemId: p.backlog_item_id ? String(p.backlog_item_id) : null,
    blockedReason: null,
    createdAt: nowSecs(),
    filesChanged: 0,
    id: `t${Math.random().toString(36).slice(2, 7)}`,
    origin: p.origin ? String(p.origin) : null,
    project: String(p.project),
    prompt,
    status: start ? ("running" as const) : ("queued" as const),
    tags: (p.tags as string[]) ?? [],
    title: firstLine(prompt),
    updatedAt: nowSecs(),
  } as TaskInfo;
  if (!start) return { task, updates: [] };
  const updates: SessionUpdate[] = [{ kind: "user_message", text: prompt }];
  if (p.include_runtime_context)
    updates.push({
      kind: "agent_text",
      text: "Context received: services are up on their dev ports. Starting.",
    });
  return { task, updates };
}

/** A chat that has not started yet adopts its first message as the prompt, as the daemon does. */
export function demoStartChat(task: TaskInfo, text: string): TaskInfo | null {
  if (task.origin !== "chat" || task.status !== "queued" || task.prompt.trim()) return null;
  return { ...task, prompt: text.trim(), status: "running", updatedAt: nowSecs() };
}
