import { daemon } from "@warpforge/daemon";
import { SPEND_DISCLAIMER } from "@warpforge/core/spend";
import { useEffect } from "react";
import { usageSummary } from "../../lib/session-usage";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";

/** Quota and estimated spend for the active accounts, as quiet meta at the bottom edge. */
export function UsageLine() {
  const state = useDaemon();
  const setPage = useShell((shell) => shell.setPage);
  const summary = usageSummary(state.agentLimits ?? [], state.agentSpend ?? []);

  useEffect(() => {
    if (!state.agentLimits) void daemon.listAgentLimits().catch(() => undefined);
    if (!state.agentSpend) void daemon.listAgentSpend().catch(() => undefined);
  }, [state.agentLimits, state.agentSpend]);

  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {summary.accounts.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {summary.today && <span title={SPEND_DISCLAIMER}>{summary.today} today, estimated</span>}
      <button
        type="button"
        onClick={() => setPage("agents")}
        className="ml-auto rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Accounts and limits
      </button>
    </footer>
  );
}
