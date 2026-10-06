import { findAgent } from "@/data/agents"
import { formatUsd, SPEND, SPEND_NOTE } from "@/data/usage"
import { useAppActions } from "@/lib/app-instance"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { QuotaWindow } from "@/pages/agents/quota"

/** Quota and spend for the active accounts, as quiet meta at the bottom edge. */
export function UsageLine() {
  const accounts = useAgentsStore((state) => state.accounts)
  const { setPage } = useAppActions()
  const today = SPEND.reduce((sum, row) => sum + (row.todayUsd ?? 0), 0)

  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {accounts
        .filter((account) => account.active)
        .map((account) => (
          <span key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="text-foreground">{findAgent(account.agent).name}</span> · {account.label}
            </span>
            {account.windows.slice(0, 2).map((window) => (
              <QuotaWindow key={window.id} window={window} />
            ))}
          </span>
        ))}
      <span title={SPEND_NOTE}>{formatUsd(today)} today, estimated</span>
      <button
        type="button"
        onClick={() => setPage("agents")}
        className="ml-auto rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Accounts and limits
      </button>
    </footer>
  )
}
