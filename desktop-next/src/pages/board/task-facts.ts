import { buildLiveStripItems, type LiveStripItem } from "@warpforge/core/liveStrip";
import { detectFailure, type FailureInfo } from "@warpforge/core/taskFailures";
import type { AgentConfig, TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { childCount, childLabel, isLead } from "../../lib/agent-family";
import { formatElapsed, liveLine } from "../../lib/live-line";
import { useDaemon } from "../../lib/use-daemon";
import { cardFacts } from "../../model/factory";

export function taskTitle(task: Pick<TaskInfo, "title" | "prompt">): string {
  return task.title || task.prompt;
}

export function agentName(agents: AgentConfig[] | undefined, id: string): string {
  return agents?.find((agent) => agent.id === id)?.displayName ?? id;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function worktreeName(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export const TONE_TEXT: Record<LiveStripItem["tone"], string> = {
  thinking: "text-sky-600 dark:text-sky-400",
  working: "text-emerald-600 dark:text-emerald-400",
  writing: "text-violet-600 dark:text-violet-400",
};

export interface TaskLine {
  agent: string;
  elapsed: string;
  /** What the agent is doing right now, only while it runs. */
  activity: { label: string; tone: LiveStripItem["tone"] } | null;
  summary: string;
  tools: number;
  workers: string;
  facts: string[];
  failure: FailureInfo | null;
  pull: TaskPullRequest | undefined;
}

/** Everything a card or row says about a task beyond its title, from the live session stream. */
export function useTaskLine(task: TaskInfo): TaskLine {
  const state = useDaemon();
  const updates = state.sessionUpdates[task.id];
  const now = nowSec();
  const strip = buildLiveStripItems([task], state.sessionUpdates, new Set())[0];
  const live = liveLine(updates, task.updatedAt, now, task.status);
  const children = childCount(task.id, state.snapshot.tasks);
  const activity = strip ?? live.activity;
  return {
    agent: agentName(state.snapshot.agents, task.agent),
    elapsed: formatElapsed(task.updatedAt, now),
    activity: activity ? { label: activity.label, tone: activity.tone } : null,
    summary:
      strip?.previewText ||
      strip?.detail ||
      live.preview ||
      live.activity?.detail ||
      (task.title && task.title !== task.prompt ? task.prompt : ""),
    tools: strip ? strip.toolCount : live.tools,
    workers: childLabel(children, Boolean(task.workflowRun), isLead(task, children)),
    facts: cardFacts(task, now).filter((fact) => fact !== task.worktree),
    failure: detectFailure(task, updates),
    pull: state.taskPullRequests?.[task.id],
  };
}
