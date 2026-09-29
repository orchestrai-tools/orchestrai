import { Lightbulb } from "lucide-react";

import { advisorLabel, formatUsageCost } from "@/lib/advisor";
import type { AgentConfig, TaskAdvisor } from "@/protocol";
import { useUi } from "@/store/ui";

/**
 * The task's advisor in the status strip; opens the advisor's own
 * conversation once it has one.
 * @param advisor the task's advisor
 * @param agents configured agents, for the harness display name
 * @returns the indicator
 */
export function AdvisorIndicator({
  advisor,
  agents,
}: {
  advisor: TaskAdvisor;
  agents: AgentConfig[];
}) {
  const openTask = useUi((s) => s.openTask);
  const label = advisorLabel(
    advisor.agent,
    advisor.model,
    agents.find((agent) => agent.id === advisor.agent)?.displayName,
  );
  const asked =
    advisor.consultations === 0
      ? "Not consulted yet"
      : `Consulted ${advisor.consultations} time${advisor.consultations === 1 ? "" : "s"}`;
  const title = `Advisor: ${label} · ${asked}${advisor.cost ? ` · ${formatUsageCost(advisor.cost)}` : ""}`;
  const taskId = advisor.taskId;
  const content = (
    <>
      <Lightbulb aria-hidden className="size-3 shrink-0" />
      <span className="max-w-40 truncate">Advisor · {label}</span>
    </>
  );
  const className = "flex h-5 min-w-0 shrink items-center gap-1 rounded px-1.5 text-[11px]";

  if (!taskId) {
    return (
      <span className={className} title={title}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={`${title} · Open the advisor's conversation`}
      aria-label={`Open advisor conversation (${label})`}
      onClick={() => openTask(taskId)}
      className={`${className} transition-colors hover:bg-secondary hover:text-foreground`}
    >
      {content}
    </button>
  );
}
