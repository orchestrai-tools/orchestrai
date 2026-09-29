import type { SessionUsageCost } from "@/protocol";

import { formatUsd } from "./agentLimits";
import { agentDisplayName } from "./agentNames";

/**
 * Names an advisor for display.
 * @param agent the advisor's agent id
 * @param model the advisor's model id, when one was picked
 * @param displayName the agent's configured display name, when known
 * @returns `Harness` or `Harness / model`
 */
export function advisorLabel(agent: string, model?: string | null, displayName?: string): string {
  const name = agentDisplayName(agent, displayName);
  return model ? `${name} / ${model}` : name;
}

/**
 * Formats a harness-reported cost.
 * @param cost the reported amount and currency
 * @returns dollars for USD (`<$0.01` below a cent), otherwise the amount followed by its currency
 */
export function formatUsageCost(cost: SessionUsageCost): string {
  if (cost.currency.toUpperCase() === "USD") {
    return cost.amount > 0 && cost.amount < 0.01 ? "<$0.01" : (formatUsd(cost.amount) ?? "");
  }
  return `${cost.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${cost.currency}`;
}
