import type { Update } from "@tauri-apps/plugin-updater";

import { daemon } from "@warpforge/daemon";

export type UpdateStatus =
  | "unsupported"
  | "off"
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdaterState {
  status: UpdateStatus;
  currentVersion: string;
  nextVersion?: string;
  notes?: string;
  progress?: number;
  error?: string;
}

type Listener = () => void;

/**
 * Off until OrchestrAI publishes its own signed releases. The upstream feed is
 * stock Warpforge's, and installing from it would replace this app with that one.
 */
export const UPDATES_ENABLED = false;

/** Four checks a day while the app stays open. */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const LAST_CHECK_KEY = "orc.update.lastCheck";

const AUTO_CHECKABLE: UpdateStatus[] = ["idle", "upToDate", "error"];

function readLastCheck(): number {
  try {
    const raw = Number(window.localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function writeLastCheck(at: number) {
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, String(at));
  } catch {
    // A webview with storage disabled just re-checks a launch earlier.
  }
}

export class DesktopUpdater {
  private listeners = new Set<Listener>();
  private update: Update | null = null;
  private initialized = false;
  private autoCheckStarted = false;
  private state: UpdaterState = {
    currentVersion: "dev",
    status: "idle",
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private setState(patch: Partial<UpdaterState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    if (!("__TAURI_INTERNALS__" in window)) {
      this.setState({ status: "unsupported" });
      return;
    }
    const { getVersion } = await import("@tauri-apps/api/app");
    this.setState({
      currentVersion: await getVersion(),
      ...(UPDATES_ENABLED ? {} : { status: "off" as const }),
    });
  }

  async check() {
    await this.initialize();
    if (this.state.status === "unsupported" || this.state.status === "off") return this.state;
    this.setState({ error: undefined, progress: undefined, status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      this.update = await check();
      if (!this.update) {
        this.setState({ nextVersion: undefined, notes: undefined, status: "upToDate" });
      } else {
        this.setState({
          nextVersion: this.update.version,
          notes: this.update.body ?? undefined,
          status: "available",
        });
      }
    } catch (error) {
      this.setState({ error: messageOf(error), status: "error" });
    }
    writeLastCheck(Date.now());
    return this.state;
  }

  startAutoCheck() {
    if (this.autoCheckStarted || this.state.status === "unsupported" || this.state.status === "off")
      return;
    this.autoCheckStarted = true;
    const start = () => {
      void this.autoCheck();
      window.setInterval(() => void this.autoCheck(), AUTO_CHECK_INTERVAL_MS);
    };
    const due = readLastCheck() + AUTO_CHECK_INTERVAL_MS - Date.now();
    if (due <= 0) start();
    else window.setTimeout(start, due);
  }

  private async autoCheck() {
    if (!AUTO_CHECKABLE.includes(this.state.status)) return;
    await this.check();
  }

  async download() {
    if (!this.update) return;
    let downloaded = 0;
    let total: number | undefined;
    this.setState({ error: undefined, progress: 0, status: "downloading" });
    try {
      await this.update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        this.setState({ progress: total ? Math.min(100, (downloaded / total) * 100) : undefined });
      });
      this.setState({ progress: 100, status: "ready" });
    } catch (error) {
      this.setState({ error: messageOf(error), status: "error" });
    }
  }

  async installAndRestart() {
    if (!this.update || this.state.status !== "ready") return;
    this.setState({ error: undefined, status: "installing" });
    let handoffAccepted = false;
    try {
      const handoff = await daemon.prepareUpdateHandoff();
      if (!handoff.ready) {
        this.setState({
          error: `Finish active work before updating: ${handoff.blockers.join(", ")}`,
          status: "ready",
        });
        return;
      }
      handoffAccepted = true;
      await daemon.waitForDisconnect();
      await this.update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      if (handoffAccepted) {
        try {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
          return;
        } catch (relaunchError) {
          this.setState({
            error: `${messageOf(error)}; OrchestrAI could not relaunch: ${messageOf(relaunchError)}`,
            status: "error",
          });
          return;
        }
      }
      daemon.resumeAfterFailedUpdate();
      this.setState({ error: messageOf(error), status: "ready" });
    }
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const updater = new DesktopUpdater();
