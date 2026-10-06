import { daemon } from "@warpforge/daemon";
import type { DetectedAgent, DetectedLanguageServer } from "@warpforge/protocol";
import { useEffect } from "react";
import { create } from "zustand";
import { agentUpdateCount, lspUpdateCount } from "./agent-updates";
import { useDaemon } from "./use-daemon";

/** Versions move slowly; four looks a day while the app is open. */
export const TOOL_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface ToolUpdatesState {
  agents: DetectedAgent[] | null;
  servers: DetectedLanguageServer[] | null;
  /** Agent detection failed, so its zero is unknown rather than up to date. */
  agentsFailed: boolean;
  refresh: () => void;
}

/** The latest detected agents and language servers, shared by every badge that counts updates. */
export const useToolUpdates = create<ToolUpdatesState>()((set) => ({
  agents: null,
  servers: null,
  agentsFailed: false,
  refresh: () => {
    void daemon.detectAgents().then(
      (agents) => set({ agents, agentsFailed: false }),
      () => set({ agentsFailed: true }),
    );
    void daemon.detectLanguageServers().then(
      (servers) => set({ servers }),
      () => undefined,
    );
  },
}));

export function refreshToolUpdates(): void {
  useToolUpdates.getState().refresh();
}

export interface ToolUpdateCounts {
  agents: number;
  servers: number;
  total: number;
}

export function toolUpdateCounts(
  state: Pick<ToolUpdatesState, "agents" | "servers">,
): ToolUpdateCounts {
  const agents = agentUpdateCount(state.agents ?? undefined);
  const servers = lspUpdateCount(state.servers ?? undefined);
  return { agents, servers, total: agents + servers };
}

export function useToolUpdateCounts(): ToolUpdateCounts {
  const agents = useToolUpdates((state) => state.agents);
  const servers = useToolUpdates((state) => state.servers);
  return toolUpdateCounts({ agents, servers });
}

/** Checks versions once connected, then on the interval. Mounted once, by the app. */
export function useToolUpdatesPolling(): void {
  const connected = useDaemon().connection === "connected";
  useEffect(() => {
    if (!connected) return;
    refreshToolUpdates();
    const timer = window.setInterval(refreshToolUpdates, TOOL_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [connected]);
}
