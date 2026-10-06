import type { AgentAccountLimits, AgentSpend } from "@warpforge/protocol";
import { formatUsd } from "@warpforge/core/spend";
import { quotaLeft } from "./account-chip";

/** Active logins and today's estimated spend, for the sessions footer. */
export function usageSummary(
  limits: AgentAccountLimits[],
  spend: AgentSpend[],
): { accounts: string[]; today: string | null } {
  const accounts = limits
    .filter((row) => row.active)
    .map((row) => {
      const window = row.windows[0];
      const left = window ? `${quotaLeft(window.usedPercent)}% left` : "";
      return [row.label || row.agentId, left].filter((part) => part.length > 0).join(" · ");
    });
  const reported = spend.some((row) => row.reported && row.todayUsd != null);
  const todayValue = spend.reduce((sum, row) => sum + (row.todayUsd ?? 0), 0);
  return { accounts, today: reported ? formatUsd(todayValue) : null };
}
