import type { AgentConfig, TaskInfo } from "@warpforge/protocol";

/** `origin` of a quick chat: a conversation with no task behind it, kept off the board. */
export const CHAT_ORIGIN = "chat";

export function isChat(task: Partial<Pick<TaskInfo, "origin">>): boolean {
  return task.origin === CHAT_ORIGIN;
}

/**
 * The agent the project last worked with, else the one used last anywhere,
 * else the first enabled one. Recent use beats list order: an agent near the
 * top of the list may have a lapsed sign-in.
 */
export function chatAgent(
  tasks: readonly Pick<TaskInfo, "project" | "agent" | "createdAt">[],
  agents: readonly Pick<AgentConfig, "id" | "enabled">[],
  project: string,
): string {
  const enabled = agents.filter((agent) => agent.enabled).map((agent) => agent.id);
  const usable = tasks.filter((task) => enabled.length === 0 || enabled.includes(task.agent));
  const latest = (list: typeof usable) =>
    list.reduce<(typeof usable)[number] | undefined>(
      (best, task) => (!best || task.createdAt > best.createdAt ? task : best),
      undefined,
    );
  const here = latest(usable.filter((task) => task.project === project));
  return (here ?? latest(usable))?.agent ?? enabled[0] ?? "claude";
}
