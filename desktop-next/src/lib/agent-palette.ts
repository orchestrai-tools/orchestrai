import { daemon } from "@warpforge/daemon";
import type { AccountInfo, AgentConfig, DetectedAgent } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the Agents page to load again. */
export const useAgentsRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

function installAgent(id: string, clean: boolean) {
  useShell.getState().setPage("agents");
  void daemon
    .installAgent(id, clean)
    .then((result) => {
      toast.success(
        result.verified ? `${id} is ready` : (result.summary ?? result.output) || "Finished",
      );
      useAgentsRefresh.getState().refresh();
    })
    .catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not install the agent"),
    );
}

function agentActions(agent: DetectedAgent, configured: AgentConfig[]): PaletteAction[] {
  const saved = configured.find((item) => item.id === agent.id);
  const enabled = Boolean(saved?.enabled);
  const actions: PaletteAction[] = [
    {
      id: `agent-${agent.id}`,
      label: enabled ? `Disable ${agent.displayName}` : `Enable ${agent.displayName}`,
      run: () => {
        const next = saved
          ? configured.map((item) => (item.id === agent.id ? { ...item, enabled: !enabled } : item))
          : [
              ...configured,
              {
                id: agent.id,
                displayName: agent.displayName,
                acpCommand: agent.defaultAcpCommand,
                enabled: true,
                models: [],
              },
            ];
        void daemon
          .saveAgents(next)
          .then(() => toast.success("Saved agents"))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not save agents"),
          );
      },
    },
  ];
  if (saved) {
    actions.push({
      id: `reload-${agent.id}`,
      label: `Reload ${agent.displayName} models`,
      run: () => {
        useShell.getState().setPage("agents");
        void daemon
          .probeAgent(agent.id)
          .then(() => toast.success("Reloaded models"))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not reload models"),
          );
      },
    });
  }
  if (agent.canManage && (!agent.installed || agent.status === "behind")) {
    actions.push({
      id: `install-${agent.id}`,
      label: agent.installed ? `Update ${agent.displayName}` : `Install ${agent.displayName}`,
      run: () => installAgent(agent.id, false),
    });
  }
  if (agent.brokenInstall && agent.canReinstall) {
    actions.push({
      id: `reinstall-${agent.id}`,
      label: `Reinstall ${agent.displayName}`,
      run: () => installAgent(agent.id, true),
    });
  }
  return actions;
}

function accountActions(account: AccountInfo): PaletteAction[] {
  const actions: PaletteAction[] = [];
  if (!account.active) {
    actions.push({
      id: `use-${account.id}`,
      label: `Use ${account.label}`,
      run: () => {
        useShell.getState().setPage("agents");
        void daemon
          .setActiveAccount(account.agentId, account.id)
          .then(() => {
            toast.success(`Using ${account.label}`);
            useAgentsRefresh.getState().refresh();
          })
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not switch accounts"),
          );
      },
    });
  }
  actions.push({
    id: `remove-${account.id}`,
    label: `Remove ${account.label}`,
    run: () => {
      useShell.getState().setPage("agents");
      void daemon
        .removeAccount(account.id)
        .then(() => {
          toast.success(`Removed ${account.label}`);
          useAgentsRefresh.getState().refresh();
        })
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Could not remove the account"),
        );
    },
  });
  return actions;
}

/** Enable, disable, and refresh the agents the page lists. */
export function useAgentPalette(open: boolean, configured: AgentConfig[]): PaletteAction[] {
  const [detected, setDetected] = useState<DetectedAgent[]>([]);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const refreshTick = useAgentsRefresh((state) => state.tick);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void daemon
      .detectAgents()
      .then((rows) => {
        if (!cancelled) setDetected(rows);
      })
      .catch(() => {
        if (!cancelled) setDetected([]);
      });
    void daemon
      .listAccounts()
      .then((rows) => {
        if (!cancelled) setAccounts(rows);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, refreshTick]);
  return [
    {
      id: "refresh-quota",
      label: "Refresh quota",
      run: () => {
        void daemon
          .listAgentLimits(true)
          .then(() => toast.success("Refreshed quota"))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not refresh the quota"),
          );
      },
    },
    {
      id: "refresh-agents",
      label: "Refresh agents",
      run: () => {
        useShell.getState().setPage("agents");
        useAgentsRefresh.getState().refresh();
      },
    },
    ...detected.flatMap((agent) => agentActions(agent, configured)),
    ...accounts.flatMap(accountActions),
  ];
}
