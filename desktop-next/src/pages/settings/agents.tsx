import { Button } from "@warpforge/ui/components/button";
import { LoaderCircleIcon } from "lucide-react";
import { AgentsPanel } from "../agents/agents-panel";
import { useAgentsStore } from "../agents/agents-store";
import { SectionHeader } from "./primitives";

function AgentsFooter() {
  const load = useAgentsStore((state) => state.load);
  const probeAll = useAgentsStore((state) => state.probeAll);
  const probing = useAgentsStore((state) => state.probing !== null);
  return (
    <div className="mx-2 flex flex-wrap items-center gap-2 border-t pt-3">
      <p className="mr-auto text-xs text-muted-foreground">
        Enable the agents you want available for new tasks. Versions are checked when this opens.
      </p>
      <Button variant="outline" size="sm" className="text-xs" onClick={load}>
        Check versions
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-xs"
        disabled={probing}
        onClick={() => void probeAll()}
      >
        {probing && <LoaderCircleIcon className="animate-spin" />}
        Reload models list
      </Button>
    </div>
  );
}

/** Every ACP agent this machine can run, with install, update, and the logins behind them. */
export function AgentsSection() {
  return (
    <>
      <SectionHeader
        title="Agents"
        scope="Every project on this Mac. Install or update an agent here; its own CLI keeps the login."
      />
      <AgentsPanel footer={<AgentsFooter />} />
    </>
  );
}
