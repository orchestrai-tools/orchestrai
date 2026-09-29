import { Lightbulb } from "lucide-react";

import { AgentConfigBar } from "../../components/AgentConfigBar";
import type { AgentConfig } from "../../protocol";
import { HarnessChip, ToggleChip } from "./chips";
import type { AdvisorPickState } from "./useAdvisorPick";

/**
 * The New Task toolbar's advisor toggle, with the advisor's harness and model
 * once it is on. Single-agent tasks only.
 * @param agents the harnesses on offer
 * @param available whether the current mode can take an advisor
 * @param state the advisor choice from `useAdvisorPick`
 * @returns the toolbar chips
 */
export function AdvisorPicker({
  agents,
  available,
  state,
}: {
  agents: AgentConfig[];
  available: boolean;
  state: AdvisorPickState;
}) {
  const active = available && state.enabled;
  const modelOption = state.modelOption;
  return (
    <>
      <ToggleChip
        active={active}
        disabled={!available}
        icon={Lightbulb}
        label="Advisor"
        title={
          available
            ? "A second agent this task can consult for advice. Read-only; it only answers when the agent asks."
            : "An advisor is available for single-agent tasks only."
        }
        onClick={state.toggle}
      />
      {active && (
        <>
          <HarnessChip
            agents={agents}
            agent={state.agent}
            label="Advisor harness"
            title="The harness the advisor runs on"
            onChange={state.setAgent}
          />
          {modelOption && (
            <AgentConfigBar
              options={[{ ...modelOption, name: "Advisor model" }]}
              picks={{ [modelOption.id]: state.model }}
              onSelect={(_, value) => state.setModel(value)}
            />
          )}
        </>
      )}
    </>
  );
}
