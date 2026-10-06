import { SPEND_DISCLAIMER, formatUsd } from "@warpforge/core/spend";
import type { AgentSpend } from "@warpforge/protocol";
import { useAgentsStore } from "./agents-store";

function spendLine(row: AgentSpend): string {
  if (!row.reported) return "Cost not reported by this agent";
  const today = formatUsd(row.todayUsd);
  const total = formatUsd(row.totalUsd);
  return [
    today && `${today} today`,
    total && `${total} in all`,
    `${row.tasks} ${row.tasks === 1 ? "task" : "tasks"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What each agent's usage would cost at API rates, per harness. */
export function SpendList({ nameOf }: { nameOf: (id: string) => string }) {
  const spend = useAgentsStore((state) => state.spend);
  const error = useAgentsStore((state) => state.spendError);
  const load = useAgentsStore((state) => state.load);
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-2 text-sm font-medium">Spend</h3>
      {error && (
        <p className="px-2 text-xs text-red-600 dark:text-red-400">
          {error}{" "}
          <button type="button" className="underline underline-offset-2" onClick={load}>
            Retry
          </button>
        </p>
      )}
      {!error && spend.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">No spend reported.</p>
      )}
      <ul className="flex flex-col">
        {spend.map((row) => (
          <li
            key={row.agentId}
            className="grid grid-cols-[minmax(11rem,15rem)_1fr] gap-3 px-2 py-(--row-py) text-xs"
          >
            <span>{nameOf(row.agentId)}</span>
            <span className="text-muted-foreground tabular-nums">{spendLine(row)}</span>
          </li>
        ))}
      </ul>
      {spend.some((row) => row.reported) && (
        <p className="px-2 text-xs text-muted-foreground">{SPEND_DISCLAIMER}</p>
      )}
    </div>
  );
}
