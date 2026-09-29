import type { SessionUsageCost } from "./tasks";

/** The advisor picked for a new task in `task.create`. */
export interface AdvisorPick {
  agent: string;
  /** Absent keeps the agent's own default model. */
  model?: string;
}

/** A task's advisor: the second agent its executor consults through `ask_advisor`. */
export interface TaskAdvisor {
  agent: string;
  model?: string | null;
  /** The advisor's hidden task (`origin: "advisor"`); unset until the first question starts it. */
  taskId?: string | null;
  /** Questions the advisor has answered or failed to answer. */
  consultations: number;
  /** Summed cost of the advisor's answers, when its harness reports cost. */
  cost?: SessionUsageCost | null;
}

export type AdvisorOutcome = "answered" | "failed";
