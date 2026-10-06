import type { AgentConfig, ExternalSession, SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { runStatus, type RunStatus } from "../../components/common/status-mark";
import { sessionActivity } from "../../lib/session-activity";
import { isChat } from "../../model/chat";

/** Idle is a saved session with no process attached: nothing is running it. */
export type SessionState = RunStatus | "idle";

export interface SessionRow {
  id: string;
  title: string;
  agent: string;
  status: SessionState;
  live: boolean;
  outside: boolean;
  origin: string;
  source: string;
  activity: string | null;
  messages: number | null;
  updatedAt: number;
  task: TaskInfo | null;
  external: ExternalSession | null;
}

const ORIGIN: Record<string, string> = {
  chat: "Chat",
  "pr-review": "Pull request assistant",
  automation: "Automation",
  factory: "Factory",
};

export function agentName(agents: readonly AgentConfig[] | undefined, id: string): string {
  return agents?.find((agent) => agent.id === id)?.displayName ?? id;
}

function taskRow(task: TaskInfo, updates: SessionUpdate[] | undefined): SessionRow {
  const status = runStatus(task);
  const live = status === "running" || status === "needs-you";
  const activity = status === "running" && updates ? sessionActivity(updates) : null;
  return {
    id: task.id,
    title: task.title || task.prompt || (isChat(task) ? "New chat" : ""),
    agent: task.agent,
    status,
    live,
    outside: false,
    origin: (task.origin && ORIGIN[task.origin]) || "Started here",
    source: task.worktree ? "Own worktree" : "Project checkout",
    activity: activity ? `${activity.label}: ${activity.detail}` : (task.blockedReason ?? null),
    messages: updates ? updates.filter((update) => update.kind === "user_message").length : null,
    updatedAt: task.updatedAt,
    task,
    external: null,
  };
}

function externalRow(session: ExternalSession): SessionRow {
  return {
    id: session.sessionId,
    title: session.title || session.sessionId,
    agent: session.agent,
    status: "idle",
    live: false,
    outside: true,
    origin: "Outside the app",
    source: "Saved by the agent",
    activity: null,
    messages: session.messageCount,
    updatedAt: session.updatedAt,
    task: null,
    external: session,
  };
}

/** The project's tasks and the agents' own saved sessions as one list, newest first. */
export function sessionRows(
  tasks: readonly TaskInfo[],
  external: readonly ExternalSession[],
  updates: Record<string, SessionUpdate[]>,
): SessionRow[] {
  return [
    ...tasks.map((task) => taskRow(task, updates[task.id])),
    ...external.map(externalRow),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
}
