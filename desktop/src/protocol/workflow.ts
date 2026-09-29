// ── Orchestration DTOs ─────────────────────────────────────────────────────

export interface OrchGraphInfo {
  id: string;
  goal: string;
  nodes: OrchNodeInfo[];
}

export interface OrchNodeInfo {
  id: string;
  kind: OrchNodeKind;
  agent: string;
  status: OrchNodeStatus;
  taskId?: string | null;
  result?: string | null;
}

export type OrchNodeKind = "plan" | "implement" | "review" | "fix" | "verify" | "merge";

export type OrchNodeStatus = "pending" | "running" | "complete" | "failed" | "skipped";

export interface OrchestratorConfig {
  plannerAgent: string;
  workerPool: OrchWorkerPool[];
  reviewerPool: OrchReviewerPool[];
  worktreesEnabled: boolean;
}

export interface OrchWorkerPool {
  agent: string;
}

export interface OrchReviewerPool {
  agent: string;
}

// ── Workflow DTOs ──────────────────────────────────────────────────────────

/** One selectable workflow template, from `workflow.list`. */
export interface WorkflowMeta {
  id: string;
  name: string;
  description?: string | null;
  source: WorkflowSource;
  /** False when the YAML failed to parse or validate — listed but unselectable. */
  valid: boolean;
  error?: string | null;
  /** Non-fatal issues (unknown keys, clamped values). */
  warnings?: string[];
  /** Stage names for the picker tooltip, e.g. ["plan","implement","review\u00d72","fix"]. */
  stages?: string[];
  maxRounds?: number;
  /** Whether the verify stage must pass; absent without a verify stage. */
  verifyRequired?: boolean | null;
}

export type WorkflowSource = "project" | "builtin";

/** Live state of a workflow pipeline, carried on its parent task. */
export interface WorkflowRunInfo {
  workflowId: string;
  workflowName: string;
  stage: WorkflowStage;
  /** Current review round, 1-based; 0 until the first review starts. */
  round: number;
  /** Round limit including any user-granted extensions. */
  maxRounds: number;
  verdict?: WorkflowVerdict | null;
  /** Set while the pipeline waits for the user. */
  waiting?: WorkflowWaiting | null;
  /** A pause is queued and takes effect when the running stage finishes. */
  pauseRequested?: boolean;
  /** Every verify-stage run, oldest first. Absent without a verify stage. */
  verifications?: WorkflowVerification[];
  /** The final summary in Markdown, verification included, once the run ended. */
  report?: string | null;
}

/** One run of the verify stage: an agent testing the change in the running app. */
export interface WorkflowVerification {
  /** Absent when the stage was refused before an agent started. */
  taskId?: string | null;
  attempt: number;
  /** Absent while the stage is still running. */
  verdict?: WorkflowVerifyVerdict | null;
  summary: string;
  checklist: WorkflowCheckItem[];
  evidence: WorkflowEvidence[];
}

export type WorkflowVerifyVerdict = "pass" | "fail" | "blocked";

export interface WorkflowCheckItem {
  step: string;
  status: "pass" | "fail" | "skipped";
  note?: string | null;
  /** Names of the screenshots the step relies on. */
  evidence?: string[];
}

/** A screenshot kept from a verify stage; read it with `workflow.evidence`. */
export interface WorkflowEvidence {
  name: string;
  path: string;
  mimeType: string;
}

export type WorkflowStage = "plan" | "implement" | "review" | "fix" | "verify" | "done" | "failed";

export type WorkflowVerdict = "approve" | "request_changes";

export interface WorkflowWaiting {
  kind: WorkflowWaitKind;
  /** Which stage asked (for `question`). */
  stage?: WorkflowStage | null;
  /** The question text, a findings summary for `limit`, or why the daemon
   *  parked the run for `paused`. */
  question?: string | null;
  /** Stable id for this barrier; pass it back with the reply/decision so a
   *  stale answer cannot land on a newer barrier. Absent on older daemons. */
  barrierId?: string | null;
  /** Who paused the run (for `paused`). Absent on older daemons. */
  pauseReason?: WorkflowPauseReason | null;
}

export type WorkflowWaitKind = "question" | "limit" | "paused";

export type WorkflowPauseReason = "user" | "quota" | "agent_lost" | "restart";

export type WorkflowDecision = "extend" | "finish" | "stop";

export interface WorkflowEventAgent {
  taskId: string;
  label: string;
  agent: string;
  model?: string | null;
}

export type WorkflowEventKind =
  | "workflow_started"
  | "stage_started"
  | "agent_output"
  | "review_result"
  | "status"
  | "workflow_finished";

export type WorkflowEventTone = "info" | "running" | "success" | "warning" | "error";
