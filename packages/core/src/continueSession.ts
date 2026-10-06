import type { TaskInfo } from "@warpforge/protocol";

import type { TokenEstimate } from "./tokenEstimate";

/** How the old conversation reaches the new session. */
export type CarryMode = "full" | "summary";

/** Where the continued work runs. */
export type Destination = "here" | "new";

/**
 * Above this, carrying the raw transcript costs more than it is worth: the new
 * session would start with a filled window and hit its own compaction early.
 * Below it, a summarising round trip is 30 seconds spent for nothing.
 */
export const SUMMARY_THRESHOLD_TOKENS = 15_000;

export function defaultCarryMode(estimate: TokenEstimate): CarryMode {
  return estimate.tokens > SUMMARY_THRESHOLD_TOKENS ? "summary" : "full";
}

/**
 * Whether the work can continue in the task it is already in.
 *
 * A task keeps one agent for its lifetime, so a different harness always means
 * a new task. Seeding a live session with a summary of itself spends context
 * to say nothing new, so continuing in place is only for a session the agent
 * has forgotten.
 */
export function canContinueHere(task: TaskInfo, agentId: string): boolean {
  return task.agent === agentId && task.blockedKind === "session_lost";
}

/** Frame a generated handoff document as the opening prompt of a new session. */
export function buildHandoffSeed(task: TaskInfo, document: string): string {
  const workspace = task.worktree
    ? `This work has a git worktree at ${task.worktree}.`
    : `This work runs in the main ${task.project} checkout.`;

  return [
    `Continue the work described below. It comes from task ${task.id}, whose session could not be carried over, so this handoff document is the only context you have.`,
    `Original request: ${task.prompt}`,
    workspace,
    "Read the relevant files before changing anything — the document summarises the conversation, not the current state of the tree.",
    "--- Handoff document ---",
    document.trim(),
    "--- End handoff document ---",
  ].join("\n\n");
}
