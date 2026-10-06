import type { Automation } from "@warpforge/protocol";

export interface AutomationFilter {
  search: string;
  enabled: "all" | "on" | "off";
  last: "all" | "failed" | "completed";
}

/** The automations that match the toolbar. */
export function filterAutomations(rows: readonly Automation[], filter: AutomationFilter): Automation[] {
  const needle = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (needle && !`${row.name}\n${row.prompt}`.toLowerCase().includes(needle)) return false;
    if (filter.enabled === "on" && !row.enabled) return false;
    if (filter.enabled === "off" && row.enabled) return false;
    if (filter.last !== "all" && row.lastStatus !== filter.last) return false;
    return true;
  });
}
