import { Button } from "@warpforge/ui/components/button";
import { useEffect, useState, type ReactNode } from "react";
import { SectionLabel } from "../../components/common/page-toolbar";
import { useAgentsRefresh } from "../../lib/agent-palette";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { AccountsSection } from "./accounts";
import { AgentList } from "./agent-list";
import { useAgentsStore } from "./agents-store";
import { DefaultsDialog } from "./defaults-dialog";

/**
 * The ACP agents this machine can run: whether each starts, its version and
 * how to install or update it, then the logins and quota behind it. The Agents
 * page and Settings › Agents both show this.
 */
export function AgentsPanel({ footer }: { footer?: ReactNode }) {
  const error = useAgentsStore((state) => state.error);
  const load = useAgentsStore((state) => state.load);
  const refreshTick = useAgentsRefresh((state) => state.tick);
  const configured = useDaemon().snapshot.agents ?? [];
  const gitTextAgent = useShell((state) => state.textGenAgentId);
  const [defaultsFor, setDefaultsFor] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const gitTextName = configured.find((agent) => agent.id === gitTextAgent)?.displayName;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button type="button" className="underline underline-offset-2" onClick={load}>
            Retry
          </button>
        </p>
      )}

      <section aria-label="ACP agents" className="-mx-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 px-2">
          <SectionLabel>ACP agents</SectionLabel>
          <span className="text-xs text-muted-foreground">
            The switch offers an agent for new tasks.
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => setDefaultsFor("global")}
          >
            Global defaults
          </Button>
        </div>
        <AgentList onDefaults={setDefaultsFor} />
        <p className="px-2 text-xs text-muted-foreground">
          {gitTextName
            ? `Commit and pull request text by ${gitTextName}.`
            : "No agent writes commit and pull request text yet."}{" "}
          <button
            type="button"
            onClick={() => setDefaultsFor("global")}
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Change
          </button>
        </p>
        {footer}
      </section>

      <AccountsSection />

      <DefaultsDialog target={defaultsFor} onOpenChange={(open) => !open && setDefaultsFor(null)} />
    </div>
  );
}
