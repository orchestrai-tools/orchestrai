import { useState } from "react";

import { configRole } from "@/lib/configRole";

import type { AdvisorPick, AgentConfig } from "../../protocol";

/**
 * The New Task advisor choice, off by default. Until a harness is picked the
 * advisor follows the executor: another harness when one is enabled, since a
 * second opinion from the same model family is worth less.
 * @param agents the harnesses on offer
 * @param executor the task's own harness
 * @returns the picker state and the `task.create` pick, `null` while off
 */
export function useAdvisorPick(agents: AgentConfig[], executor: string) {
  const [enabled, setEnabled] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [modelPick, setModelPick] = useState<{ agent: string; model?: string } | null>(null);

  const agent =
    chosen && agents.some((candidate) => candidate.id === chosen)
      ? chosen
      : (agents.find((candidate) => candidate.id !== executor)?.id ?? executor);
  const modelOption = agents
    .find((candidate) => candidate.id === agent)
    ?.models?.find((option) => configRole(option) === "model");
  const model = modelPick?.agent === agent ? modelPick.model : undefined;
  const pick: AdvisorPick | null = enabled ? { agent, ...(model ? { model } : {}) } : null;

  return {
    agent,
    enabled,
    model,
    modelOption,
    pick,
    setAgent: setChosen,
    setModel: (next: string | undefined) => setModelPick({ agent, model: next }),
    toggle: () => setEnabled((current) => !current),
  };
}

export type AdvisorPickState = ReturnType<typeof useAdvisorPick>;
