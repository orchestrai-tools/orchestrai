// ── Backlog runner ("Factory", ADR 0023) ──────────────────────────────────────

export interface RunnerSettings {
  project: string;
  /** Whether queued items start. Pausing never stops a run in flight. */
  running: boolean;
  workflow: string;
  /** Lead agent; empty means the first enabled agent. */
  agent: string;
  model?: string | null;
  maxConcurrent: number;
  maxOpenPrs: number;
  /** Items started in any 24 hours. */
  maxPerDay: number;
  headroomPct: number;
  minFreeGb: number;
  updatedAt: number;
}

/** A settings edit; absent fields are left alone, an empty `model` clears it. */
export type RunnerSettingsPatch = Partial<Omit<RunnerSettings, "project" | "updatedAt">>;

export type RunnerEntryState = "queued" | "running" | "delivering" | "delivered";

export interface RunnerEntry {
  itemId: string;
  project: string;
  number: number;
  title: string;
  priority: string;
  position: number;
  /** Epoch seconds. */
  enqueuedAt: number;
  state: RunnerEntryState;
  workflow?: string | null;
  agent?: string | null;
  model?: string | null;
  taskId?: string | null;
  runId?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  /** Why a queued entry is not starting yet. */
  waitingReason?: string | null;
  updatedAt: number;
}

export type ItemRunOutcome =
  | "running"
  | "delivering"
  | "delivered"
  | "merged"
  | "rejected"
  | "no_changes"
  | "limit_hit"
  | "stopped"
  | "failed"
  | "delivery_failed"
  | "task_deleted";

/** One attempt of one item. Times are epoch seconds. */
export interface ItemRun {
  id: string;
  project: string;
  itemId: string;
  itemNumber: number;
  itemTitle: string;
  taskId?: string | null;
  workflow: string;
  agent: string;
  model?: string | null;
  enqueuedAt: number;
  dispatchedAt: number;
  finishedAt?: number | null;
  prOpenedAt?: number | null;
  mergedAt?: number | null;
  closedAt?: number | null;
  rounds: number;
  fixRounds: number;
  /** USD; null when no agent reported cost. */
  costUsd?: number | null;
  outcome: ItemRunOutcome;
  detail?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
}

export interface RunnerStatus {
  settings: RunnerSettings;
  /** Queued entries in start order, then the ones in flight or in review. */
  entries: RunnerEntry[];
  dispatchedToday: number;
  /** Why no queued item starts right now. */
  hold?: string | null;
}
