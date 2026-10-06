// ── Factory (ADR 0023; the daemon calls it the runner) ───────────────────────

/**
 * Where Factory tasks run: a background copy (worktree) each, the project
 * folder one at a time so the running dev services serve the change, or
 * `auto`: the project folder for a template that tests the app.
 */
export type RunLocation = "worktree" | "checkout" | "auto";

/** One task's own choice; `default` is Automatic, via the project setting. */
export type EntryRunLocation = "default" | "worktree" | "checkout";

export interface RunnerSettings {
  project: string;
  /** Default workflow template for a Factory task. */
  workflow: string;
  /** Default lead agent; empty means the first enabled agent. */
  agent: string;
  model?: string | null;
  /** Factory tasks running at once. */
  maxConcurrent: number;
  /** New Factory tasks wait while this many of their draft PRs are open. */
  maxOpenPrs: number;
  /** Factory tasks started in any 24 hours. */
  maxPerDay: number;
  /** New tasks wait while an agent's quota window is above this percentage. */
  headroomPct: number;
  /** New tasks wait below this much free disk; 0 turns it off. */
  minFreeGb: number;
  /** Where a task runs when it does not choose. */
  runLocation: RunLocation;
  updatedAt: number;
}

/** A settings edit; absent fields are left alone, an empty `model` clears it. */
export type RunnerSettingsPatch = Partial<Omit<RunnerSettings, "project" | "updatedAt">>;

export type RunnerEntryState = "queued" | "running" | "delivering" | "delivered";

/** Why the project folder cannot take a Factory task right now. */
export type CheckoutBusyCause =
  | "dirty"
  | "operation"
  | "task_running"
  | "in_use"
  | "yaml_backlog"
  | "other";

/** What keeps a queued Factory task from starting. */
export type RunnerWait =
  | { kind: "slots"; inUse: number; limit: number }
  | { kind: "open_prs"; open: number; limit: number }
  | { kind: "daily"; started: number; limit: number; nextAt?: number | null }
  | {
      kind: "quota";
      agent: string;
      account?: string | null;
      window?: string | null;
      usedPct?: number | null;
      limitPct?: number | null;
      /** Epoch seconds. */
      resetsAt?: number | null;
    }
  | { kind: "disk"; freeGb: number; minGb: number }
  | { kind: "checkout_busy"; cause: CheckoutBusyCause; detail?: string | null }
  | { kind: "checkout_held"; reason: string; taskId?: string | null }
  | { kind: "workflow_invalid"; workflow: string; error: string }
  | { kind: "other"; detail: string };

/** One Factory task the daemon schedules, keyed by its task. */
export interface RunnerEntry {
  taskId: string;
  /** The backlog item it works on, when started from one. */
  itemId?: string | null;
  project: string;
  /** Item number; 0 without an item. */
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
  runLocation?: EntryRunLocation;
  /** Whether a successful run opens a draft pull request. */
  deliver: boolean;
  /** Where the running attempt runs, set when it starts; never `auto`. */
  resolvedLocation?: Exclude<RunLocation, "auto"> | null;
  runId?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  /** Why this queued task, and only this one, is not starting yet. */
  wait?: RunnerWait | null;
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
  | "task_deleted"
  | "completed";

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
  /** Where the attempt ran; absent on rows recorded before it was. */
  runLocation?: Exclude<RunLocation, "auto"> | null;
  /** Whether the attempt was to open a draft pull request. */
  deliver?: boolean;
}

export type CheckoutLeaseState = "preparing" | "running" | "returning" | "held";

/** The Factory's use of the project folder for a task that opens a PR. */
export interface CheckoutLease {
  project: string;
  itemId?: string | null;
  itemNumber: number;
  taskId: string;
  /** `warpforge/task/<taskId>`. */
  branch: string;
  /** The branch the checkout returns to; null for a detached HEAD. */
  returnBranch?: string | null;
  returnCommit?: string | null;
  state: CheckoutLeaseState;
  /** What the person has to do before the checkout can be given back. */
  heldReason?: string | null;
  updatedAt: number;
}

export interface RunnerStatus {
  settings: RunnerSettings;
  /** Queued entries in start order, then the ones in flight or in review. */
  entries: RunnerEntry[];
  dispatchedToday: number;
  /** Why no queued task of the project starts right now. */
  hold?: RunnerWait | null;
  checkout?: CheckoutLease | null;
}

/** The shared configuration of Factory tasks started from backlog items. */
export interface FactoryConfig {
  workflow?: string | null;
  agent?: string | null;
  model?: string | null;
  runLocation: EntryRunLocation;
  /** Open a draft pull request when the run succeeds. */
  deliver: boolean;
}

export type SkipReason =
  | { kind: "already_in_factory"; taskId?: string | null }
  | { kind: "closed"; status: string }
  | { kind: "not_found" }
  | { kind: "unreadable"; detail: string };

export interface SkippedItem {
  itemId: string;
  number: number;
  reason: SkipReason;
}

export interface CreatedFactoryTask {
  taskId: string;
  itemId?: string | null;
  /** Started at once; otherwise queued. */
  started: boolean;
}

/** What starting Factory tasks did, item by item. */
export interface EnqueueResult {
  created: CreatedFactoryTask[];
  skipped: SkippedItem[];
  status: RunnerStatus;
}
