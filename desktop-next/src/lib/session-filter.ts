export type SessionOrigin = "all" | "here" | "outside";

export function listedAgents(agents: string[]): string[] {
  return [...new Set(agents.filter((agent) => agent.length > 0))].sort();
}

export function showOrigin(origin: SessionOrigin, kind: "here" | "outside"): boolean {
  return origin === "all" || origin === kind;
}

export function matchesAgent(agent: string, selected: string): boolean {
  return selected === "" || agent === selected;
}
