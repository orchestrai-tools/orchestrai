import { Button } from "@warpforge/ui/components/button";
import { PageToolbar } from "../components/common/page-toolbar";
import { agentState } from "./agents/agent-state";
import { AgentsPanel } from "./agents/agents-panel";
import { useAgentsStore } from "./agents/agents-store";

/** The agents page: a count of what is ready, to update, or missing, over the shared agents panel. */
export function AgentsPage() {
  const detected = useAgentsStore((state) => state.detected);
  const load = useAgentsStore((state) => state.load);

  const count = (state: string) =>
    detected.filter((agent) => agentState(agent, false) === state).length;
  const meta = [
    `${count("ready")} ready`,
    count("update") && `${count("update")} to update`,
    count("broken") && `${count("broken")} cannot start`,
    count("missing") && `${count("missing")} not installed`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <PageToolbar title="Agents" meta={detected.length > 0 ? meta : undefined}>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </PageToolbar>
      <AgentsPanel />
    </div>
  );
}
