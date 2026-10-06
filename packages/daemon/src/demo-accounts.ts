import type {
  AccountInfo,
  AgentAccountLimits,
  AgentSpend,
  DetectedAgent,
} from "@warpforge/protocol";

/** Quota and estimated spend for the demo account menu. */
export function demoAccountLimits(): AgentAccountLimits[] {
  return [
    {
      accountId: "claude:work",
      agentId: "claude",
      label: "Work",
      active: true,
      exhausted: false,
      fetchedAt: Math.floor(Date.now() / 1000),
      plan: "Max",
      source: "api",
      windows: [{ id: "five_hour", label: "Session", usedPercent: 27 }],
    },
  ];
}

export function demoAgentSpend(): AgentSpend[] {
  return [{ agentId: "claude", todayUsd: 1.23, totalUsd: 40, tasks: 2, reported: true }];
}

/** List and edit the demo logins. Unknown methods return null. */
export function demoAccountReply(
  accounts: AccountInfo[],
  method: string,
  params: Record<string, unknown>,
): AccountInfo[] | null {
  if (method === "accounts.list") return accounts;
  if (method === "accounts.import") {
    const agentId = String(params.agent_id ?? "");
    const label = String(params.label ?? "").trim();
    if (!agentId || !label) return accounts;
    const id = `${agentId}:${label.toLowerCase().replace(/\s+/g, "-")}`;
    if (accounts.some((account) => account.id === id)) return accounts;
    const active = !accounts.some((account) => account.agentId === agentId && account.active);
    return [...accounts, { active, agentId, id, label }];
  }
  if (method === "accounts.rename") {
    const id = String(params.account_id ?? "");
    const label = String(params.label ?? "");
    return accounts.map((account) => (account.id === id ? { ...account, label } : account));
  }
  if (method === "accounts.remove") {
    const id = String(params.account_id ?? "");
    return accounts.filter((account) => account.id !== id);
  }
  if (method === "accounts.setActive") {
    const id = String(params.account_id ?? "");
    const agentId = String(params.agent_id ?? "");
    return accounts.map((account) =>
      account.agentId === agentId ? { ...account, active: account.id === id } : account,
    );
  }
  return null;
}

/** A detected agent whose install will not start. */
export function demoDetectedAgents(): DetectedAgent[] {
  return [
    {
      brokenInstall: { detail: "exit 1", summary: "The binary will not start" },
      canManage: true,
      canReinstall: true,
      defaultAcpCommand: "claude",
      displayName: "Claude",
      id: "claude",
      installHint: "",
      installed: true,
      status: "current",
      version: "1.0.0",
    },
    {
      canManage: true,
      canReinstall: true,
      defaultAcpCommand: "codex",
      displayName: "Codex",
      id: "codex",
      installHint: "",
      installed: true,
      latestVersion: "1.1.0",
      status: "behind",
      version: "0.9.0",
    },
    {
      canManage: false,
      defaultAcpCommand: "gemini",
      displayName: "Gemini",
      id: "gemini",
      installHint: "npm install -g @google/gemini-cli",
      installed: false,
      status: "missing",
    },
  ];
}
