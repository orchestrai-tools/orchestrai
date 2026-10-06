import type { ConfigOption, DetectedAgent } from "@warpforge/protocol";
import { modelChoices } from "../../lib/new-task";

/** What detection and the last start attempt say about an agent, plus a running install. */
export type AgentState = "ready" | "missing" | "update" | "broken" | "unknown" | "installing";

export function agentState(agent: DetectedAgent, busy: boolean): AgentState {
  if (busy) return "installing";
  if (agent.brokenInstall) return "broken";
  if (!agent.installed || agent.status === "missing") return "missing";
  if (agent.status === "behind") return "update";
  if (agent.status === "current") return "ready";
  return "unknown";
}

/** The display name of a model value, or the value itself when the probe never listed it. */
export function modelName(options: ConfigOption[], value: string): string {
  return modelChoices(options).find((choice) => choice.value === value)?.name ?? value;
}

/** The selectors other than the model one, which the row lists with the value the agent starts on. */
export function otherOptions(options: ConfigOption[]): ConfigOption[] {
  const model = options.find((option) => modelChoices([option]).length > 0);
  return options.filter((option) => option !== model);
}
