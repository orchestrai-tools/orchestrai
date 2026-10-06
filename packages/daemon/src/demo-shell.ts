import type { TaskInfo } from "@warpforge/protocol";

/** A resumed on-disk session becomes a new waiting task, the same way the daemon does. */
export function demoResumeTask(input: Record<string, unknown>): { taskId: string; task: TaskInfo } {
  const agent = String(input.agent ?? "claude");
  const title = String(input.title ?? "").trim() || `Resumed ${agent} session`;
  const taskId = `resume-${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    taskId,
    task: {
      agent,
      blockedReason: null,
      createdAt: now,
      filesChanged: 0,
      id: taskId,
      parentTaskId: null,
      project: String(input.project ?? "demo"),
      prompt: title,
      status: "waiting" as const,
      tags: ["resumed"],
      title,
      updatedAt: now,
      worktree: null,
    },
  };
}

/** Fork copies the source task into a new waiting task. */
export function demoForkTask(
  tasks: TaskInfo[],
  input: Record<string, unknown>,
): { taskId: string; task: TaskInfo } {
  const sourceId = String(input.task_id ?? "");
  const source = tasks.find((task) => task.id === sourceId);
  const taskId = `fork-${sourceId || "demo"}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Math.floor(Date.now() / 1000);
  const prompt = source?.prompt ?? "Fork";
  return {
    taskId,
    task: {
      agent: source?.agent ?? "claude",
      blockedReason: null,
      createdAt: now,
      filesChanged: 0,
      id: taskId,
      parentTaskId: sourceId || null,
      project: source?.project ?? String(input.project ?? "demo"),
      prompt,
      status: "waiting",
      tags: sourceId ? [`fork:${sourceId}`] : [],
      title: source?.title ? `Fork of ${source.title}` : "Fork",
      updatedAt: now,
      worktree: source?.worktree ?? null,
    },
  };
}

/** On-disk sessions the demo Sessions page can resume. */
export function demoExternalSessions(now: number) {
  return [
    {
      agent: "claude",
      messageCount: 4,
      sessionId: "demo-session",
      title: "Earlier sketch",
      updatedAt: now - 3600,
    },
    {
      agent: "opencode",
      messageCount: 2,
      sessionId: "demo-opencode",
      title: "Port the shell",
      updatedAt: now - 7200,
    },
    {
      agent: "goose",
      messageCount: 1,
      sessionId: "demo-goose",
      title: "Name the column",
      updatedAt: now - 10800,
    },
    {
      agent: "pi",
      messageCount: 1,
      sessionId: "demo-pi",
      title: "Name the board",
      updatedAt: now - 14400,
    },
  ];
}

/** Directory a demo shell command runs in: the open task's worktree, or the project. */
export function demoShellCwd(
  tasks: Array<{ id?: string; worktree?: unknown }>,
  taskId: unknown,
): string {
  const id = String(taskId ?? "");
  const worktree = tasks.find((task) => task.id === id)?.worktree;
  return typeof worktree === "string" && worktree.trim() ? `/demo/${worktree.trim()}` : "/demo";
}
