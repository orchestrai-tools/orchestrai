import { useEffect, useRef, useState, type FormEvent } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { findAgent, type AgentId } from "@/data/agents"
import { exhaustedWindow, formatUsd, SPEND, SPEND_NOTE, SWITCH_NOTE, type AgentAccount } from "@/data/usage"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { QuotaWindow } from "@/pages/agents/quota"

/** Agents that support several logins. The rest keep one login of their own. */
const ACCOUNT_AGENTS: readonly AgentId[] = ["claude", "codex"]
const LOGIN_COMMAND: Partial<Record<AgentId, string>> = { claude: "claude", codex: "codex login" }

function AccountRow({ account, onRemove }: { account: AgentAccount; onRemove: () => void }) {
  const activate = useAgentsStore((state) => state.activateAccount)
  const spent = exhaustedWindow(account)
  return (
    <li className="group/row grid grid-cols-[minmax(11rem,15rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{account.label}</span>
          {account.active && <span className="text-xs text-muted-foreground">Active</span>}
          {account.outdated && (
            <span className="text-xs text-amber-700 dark:text-amber-400" title={`Last updated ${account.updated}. These are the last good numbers.`}>
              Outdated
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{[account.email, account.plan].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        {account.windows.map((window) => (
          <QuotaWindow key={window.id} window={window} showReset={window.usedPercent >= 100} />
        ))}
        {spent && <span className="text-xs text-muted-foreground">New runs on it are refused until it resets.</span>}
      </div>
      <div className="flex items-center gap-1">
        {!account.active && (
          <Button size="xs" variant="outline" onClick={() => activate(account.id)}>
            Use
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`More for ${account.label}`}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(account.id)}>Copy account id</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={account.active} onSelect={onRemove}>
              {account.active ? "Switch away before removing" : "Remove account…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function AgentAccounts({ agent, accounts, onRemove }: { agent: AgentId; accounts: AgentAccount[]; onRemove: (account: AgentAccount) => void }) {
  const importAccount = useAgentsStore((state) => state.importAccount)
  const lastSwitch = useAgentsStore((state) => state.lastSwitch)
  const [label, setLabel] = useState("")
  const name = findAgent(agent).name

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!label.trim()) return
    importAccount(agent, label)
    setLabel("")
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-2 text-sm font-medium">{name}</h3>
      <ul className="flex flex-col">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} onRemove={() => onRemove(account)} />
        ))}
      </ul>
      {lastSwitch?.agent === agent && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {name} now uses {lastSwitch.label}. {SWITCH_NOTE}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-2 pt-1">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label, for example client-x"
          aria-label={`Label for a new ${name} account`}
          className="h-7 w-52 text-xs md:text-xs"
        />
        <Button type="submit" size="xs" variant="outline" disabled={!label.trim()}>
          Import current login
        </Button>
        <span className="text-xs text-muted-foreground">
          Sign in with <code className="font-mono">{LOGIN_COMMAND[agent]}</code> in a terminal first; this imports whoever is signed in now.
        </span>
      </form>
    </div>
  )
}

function SpendList() {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-2 text-sm font-medium">Spend</h3>
      <ul className="flex flex-col">
        {SPEND.map((row) => (
          <li key={row.agent} className="grid grid-cols-[minmax(11rem,15rem)_1fr] gap-3 px-2 py-(--row-py) text-xs">
            <span>{findAgent(row.agent).name}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.reported
                ? [
                    row.todayUsd !== null && `${formatUsd(row.todayUsd)} today`,
                    row.totalUsd !== null && `${formatUsd(row.totalUsd)} in all`,
                    `${row.tasks} tasks`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Cost not reported by this agent"}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-2 text-xs text-muted-foreground">{SPEND_NOTE}</p>
    </div>
  )
}

/** Several logins per agent, one active, with the quota each has left and what the agents have spent. */
export function AccountsSection() {
  const accounts = useAgentsStore((state) => state.accounts)
  const removeAccount = useAgentsStore((state) => state.removeAccount)
  const [removing, setRemoving] = useState<AgentAccount | null>(null)
  const [updated, setUpdated] = useState("1m ago")
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const refresh = () => {
    setRefreshing(true)
    timer.current = window.setTimeout(() => {
      setUpdated("just now")
      setRefreshing(false)
    }, 900)
  }

  return (
    <section aria-label="Accounts and usage" className="-mx-2 flex flex-col gap-3">
      <div className="flex items-center gap-2 px-2">
        <SectionLabel>Accounts and usage</SectionLabel>
        <span className="ml-auto text-xs text-muted-foreground">Quota updated {updated}</span>
        <Button variant="ghost" size="xs" disabled={refreshing} onClick={refresh}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {ACCOUNT_AGENTS.map((agent) => (
        <AgentAccounts key={agent} agent={agent} accounts={accounts.filter((account) => account.agent === agent)} onRemove={setRemoving} />
      ))}
      <SpendList />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.label ?? "this account"}?`}
        description="Deletes its vault under ~/.orchestrai/accounts. The agent's own login in its home folder is never touched, and sessions recorded on it fall back to that home."
        confirmLabel="Remove account"
        onConfirm={() => removing && removeAccount(removing.id)}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </section>
  )
}
