import { daemon } from "@warpforge/daemon";
import type {
  AccountInfo,
  AgentAccountLimits,
  AgentConfig,
  AgentSpend,
  DetectedAgent,
} from "@warpforge/protocol";
import { toast } from "sonner";
import { create } from "zustand";
import { useToolUpdates } from "../../lib/tool-updates";

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

interface AgentsStore {
  detected: DetectedAgent[];
  accounts: AccountInfo[];
  limits: AgentAccountLimits[];
  spend: AgentSpend[];
  error: string | null;
  limitsError: string | null;
  spendError: string | null;
  /** Agent whose install, update, or reinstall is running. */
  busy: string | null;
  /** Agent whose model list is being read again over ACP. */
  probing: string | null;
  refreshingLimits: boolean;
  lastSwitch: { agentId: string; label: string } | null;
  load: () => void;
  refreshLimits: () => void;
  install: (id: string, clean: boolean) => Promise<void>;
  probe: (id: string) => void;
  /** Reloads the model list of every enabled agent, one after another. */
  probeAll: () => Promise<void>;
  importAccount: (agentId: string, label: string) => void;
  activateAccount: (account: AccountInfo) => void;
  removeAccount: (id: string) => void;
}

/** Saves the whole agent list; the daemon replaces what it had. */
export async function saveAgents(next: AgentConfig[], success = "Saved agents") {
  try {
    await daemon.saveAgents(next);
    toast.success(success);
  } catch (err) {
    toast.error(message(err, "Could not save agents"));
  }
}

/** The configured list with one agent switched on or off, adding it from detection when it was never saved. */
export function withEnabled(
  configured: AgentConfig[],
  agent: DetectedAgent,
  enabled: boolean,
): AgentConfig[] {
  if (configured.some((item) => item.id === agent.id)) {
    return configured.map((item) => (item.id === agent.id ? { ...item, enabled } : item));
  }
  return [
    ...configured,
    {
      id: agent.id,
      displayName: agent.displayName,
      acpCommand: agent.defaultAcpCommand,
      enabled,
      models: [],
    },
  ];
}

export const useAgentsStore = create<AgentsStore>()((set, get) => ({
  detected: [],
  accounts: [],
  limits: [],
  spend: [],
  error: null,
  limitsError: null,
  spendError: null,
  busy: null,
  probing: null,
  refreshingLimits: false,
  lastSwitch: null,

  load: () => {
    set({ error: null });
    void daemon
      .detectAgents()
      .then((detected) => {
        set({ detected });
        useToolUpdates.setState({ agents: detected, agentsFailed: false });
      })
      .catch((err: unknown) => set({ error: message(err, "Could not detect agents") }));
    void daemon
      .listAccounts()
      .then((accounts) => set({ accounts }))
      .catch((err: unknown) => set({ error: message(err, "Could not list accounts") }));
    get().refreshLimits();
    void daemon
      .listAgentSpend()
      .then((spend) => set({ spend, spendError: null }))
      .catch((err: unknown) => set({ spendError: message(err, "Could not load spend") }));
  },
  refreshLimits: () => {
    set({ refreshingLimits: true });
    void daemon
      .listAgentLimits(true)
      .then((limits) => set({ limits, limitsError: null }))
      .catch((err: unknown) => set({ limitsError: message(err, "Could not load limits") }))
      .finally(() => set({ refreshingLimits: false }));
  },
  install: async (id, clean) => {
    set({ busy: id });
    try {
      const result = await daemon.installAgent(id, clean);
      toast.success(
        result.verified ? `${id} is ready` : (result.summary ?? result.output) || "Finished",
      );
      get().load();
    } catch (err) {
      toast.error(message(err, "Could not install the agent"));
    } finally {
      set({ busy: null });
    }
  },
  probe: (id) => {
    set({ probing: id });
    void daemon
      .probeAgent(id)
      .then(() => toast.success("Reloaded models"))
      .catch((err: unknown) => toast.error(message(err, "Could not reload models")))
      .finally(() => set({ probing: null }));
  },
  probeAll: async () => {
    const enabled = (daemon.getState().snapshot.agents ?? []).filter((agent) => agent.enabled);
    if (enabled.length === 0) {
      toast.info("Enable an agent first");
      return;
    }
    const failed: string[] = [];
    for (const agent of enabled) {
      set({ probing: agent.id });
      try {
        await daemon.probeAgent(agent.id);
      } catch {
        failed.push(agent.displayName);
      }
    }
    set({ probing: null });
    if (failed.length > 0) toast.error(`Could not reload models for ${failed.join(", ")}`);
    else toast.success("Reloaded models");
  },
  importAccount: (agentId, label) => {
    void daemon
      .importAccount(agentId, label.trim())
      .then((accounts) => set({ accounts }))
      .catch((err: unknown) => toast.error(message(err, "Could not import the account")));
  },
  activateAccount: (account) => {
    void daemon
      .setActiveAccount(account.agentId, account.id)
      .then((accounts) =>
        set({ accounts, lastSwitch: { agentId: account.agentId, label: account.label } }),
      )
      .catch((err: unknown) => toast.error(message(err, "Could not switch accounts")));
  },
  removeAccount: (id) => {
    void daemon
      .removeAccount(id)
      .then((accounts) => set({ accounts }))
      .catch((err: unknown) => toast.error(message(err, "Could not remove the account")));
  },
}));
