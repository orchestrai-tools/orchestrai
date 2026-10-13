import type { CoreClient } from "./client";
import { MAX_PORTFORWARD_LOGS, MAX_SERVICE_LOGS, type Constructor, type LogEntry } from "./types";

/** What `quitCheck` reports: what a quit would stop, and who owns the daemon. */
export interface QuitCheck {
  blockers: string[];
  owned: boolean;
}

/** Retained lines are contiguous by seq and end just below `nextSeq`, so each
 *  line's seq follows from its position. */
function toLogEntries(result: unknown): LogEntry[] {
  const payload = result as { lines?: unknown; at?: unknown; nextSeq?: unknown };
  const rawLines = Array.isArray(result)
    ? result
    : Array.isArray(payload?.lines)
      ? payload.lines
      : [];
  const at = Array.isArray(payload?.at) ? payload.at : [];
  const nextSeq = typeof payload?.nextSeq === "number" ? payload.nextSeq : rawLines.length;
  const firstSeq = nextSeq - rawLines.length;
  return rawLines.map((line, i) => ({
    at: typeof at[i] === "number" ? at[i] : 0,
    line: String(line),
    seq: firstSeq + i,
  }));
}

/** A fetched snapshot may finish after newer live lines have arrived. */
function mergeLogs(current: LogEntry[], fetched: LogEntry[], limit: number): LogEntry[] {
  const bySeq = new Map(current.map((entry) => [entry.seq, entry]));
  for (const entry of fetched) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-limit);
}

export function RuntimeMethods<TBase extends Constructor<CoreClient>>(Base: TBase) {
  return class extends Base {
    private logFetches = new Map<string, number>();
    private nextLogFetch = 0;

    private beginLogFetch(key: string): number {
      const generation = ++this.nextLogFetch;
      this.logFetches.set(key, generation);
      return generation;
    }

    protected resetRuntimeLogs(): void {
      this.logFetches.clear();
      super.resetRuntimeLogs();
    }
    async stopRuntime() {
      await this.request("runtime.stopAll", {});
    }

    /** Ask what a quit would stop. Read-only; the daemon keeps running. */
    async quitCheck(): Promise<QuitCheck> {
      return (await this.request("app.quitCheck", {})) as QuitCheck;
    }

    /** Stop everything and shut down a desktop-owned daemon. */
    async quitRuntime() {
      await this.request("app.quit", {});
    }

    async fetchServiceLogs(
      project: string,
      service: string,
      options: { after?: number; limit?: number } = {},
    ): Promise<LogEntry[]> {
      const key = `${project}/${service}`;
      const fetchKey = `service:${key}`;
      const generation = this.beginLogFetch(fetchKey);
      const result = await this.request("service.logs", {
        after: options.after ?? 0,
        limit: options.limit ?? 300,
        project,
        service,
      });
      const lines = toLogEntries(result);
      if (this.logFetches.get(fetchKey) !== generation) return lines;
      this.setState({
        serviceLogs: {
          ...this.state.serviceLogs,
          [key]: mergeLogs(this.state.serviceLogs[key] ?? [], lines, MAX_SERVICE_LOGS),
        },
      });
      return lines;
    }

    async fetchPortForwardLogs(
      project: string,
      name: string,
      options: { after?: number; limit?: number } = {},
    ): Promise<LogEntry[]> {
      const key = `${project}/${name}`;
      const fetchKey = `forward:${key}`;
      const generation = this.beginLogFetch(fetchKey);
      const result = await this.request("portforward.logs", {
        after: options.after ?? 0,
        limit: options.limit ?? 300,
        project,
        name,
      });
      const lines = toLogEntries(result);
      if (this.logFetches.get(fetchKey) !== generation) return lines;
      this.setState({
        portforwardLogs: {
          ...this.state.portforwardLogs,
          [key]: mergeLogs(this.state.portforwardLogs[key] ?? [], lines, MAX_PORTFORWARD_LOGS),
        },
      });
      return lines;
    }
  };
}
