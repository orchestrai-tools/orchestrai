/** A git worktree for an isolated task. */
export interface WorktreeInfo {
  taskId: string;
  path: string;
  branch: string;
  baseBranch: string;
}

/** One worktree of a project, as the Worktrees panel lists it. */
export interface WorktreeRow {
  path: string;
  /** Absent on a detached HEAD. */
  branch?: string | null;
  /** The owning task; absent for an orphan. */
  taskId?: string | null;
  taskTitle?: string | null;
  orphan: boolean;
  /** Bytes on disk; absent while unknown because measuring timed out. */
  sizeBytes?: number | null;
  hasSetupLog: boolean;
}

/** An agent session discovered on disk (claude/codex), resumable via task.resume. */
export interface ExternalSession {
  agent: string;
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

// ── Names on disk ────────────────────────────────────────────────────────────

/** The project's own config folder: workspace file, local overrides, workflows, backlog. */
export const PROJECT_DIR = ".orchestrai";
/** The machine data folder, as shown to people. */
export const DATA_DIR = "~/.orchestrai";

// ── Daemon discovery (~/.orchestrai/daemon.json) ────────────────────────────

export interface DaemonEndpoint {
  pid: number;
  url: string;
  token: string;
  version: string;
  protocolVersion: number;
  owner: "desktop" | "external";
  exe?: string | null;
  startedAt?: number | null;
}

export interface DaemonHandshake {
  daemonVersion: string;
  protocolVersion: number;
  owner: "desktop" | "external";
  protocolCompatible: boolean;
  exactVersionMatch: boolean;
}

export interface UpdateHandoff {
  ready: boolean;
  blockers: string[];
}
