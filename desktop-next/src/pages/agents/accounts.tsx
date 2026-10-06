import type { AccountInfo, AgentAccountLimits } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Input } from "@warpforge/ui/components/input";
import { MoreHorizontalIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { SectionLabel } from "../../components/common/page-toolbar";
import { SelectMenu } from "../../components/common/select-menu";
import { EmailText } from "../../components/email-text";
import { isSnapshotOutdated, lastUpdatedSentence } from "../../lib/agent-limits";
import { copyText } from "../services/runtime-actions";
import { useAgentsStore } from "./agents-store";
import { QuotaWindow } from "./quota";
import { SpendList } from "./spend";

const ROW =
  "group/row grid grid-cols-[minmax(11rem,15rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40";

function Quota({ quota, now }: { quota: AgentAccountLimits | null; now: number }) {
  if (!quota) return <span className="text-xs text-muted-foreground">No quota reported</span>;
  if (quota.error)
    return <span className="text-xs text-red-600 dark:text-red-400">{quota.error}</span>;
  return (
    <>
      {quota.windows.map((window) => (
        <QuotaWindow key={window.id} window={window} now={now} />
      ))}
    </>
  );
}

function AccountRow({
  account,
  quota,
  now,
  onRemove,
}: {
  account: AccountInfo;
  quota: AgentAccountLimits | null;
  now: number;
  onRemove: () => void;
}) {
  const activate = useAgentsStore((state) => state.activateAccount);
  const outdated = quota ? isSnapshotOutdated(quota.fetchedAt, now) : false;
  return (
    <li className={ROW}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">
            <EmailText text={account.label} />
          </span>
          {account.active && <span className="text-xs text-muted-foreground">Active</span>}
          {outdated && quota && (
            <span
              className="text-xs text-amber-700 dark:text-amber-400"
              title={`${lastUpdatedSentence(quota.fetchedAt, now)}. These are the last good numbers.`}
            >
              Outdated
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          <EmailText text={[account.email, account.plan].filter(Boolean).join(" · ")} />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <Quota quota={quota} now={now} />
      </div>
      <div className="flex items-center gap-1">
        {!account.active && (
          <Button size="xs" variant="outline" onClick={() => activate(account)}>
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
            <DropdownMenuItem onSelect={() => copyText(account.id)}>
              Copy account id
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove account…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** A quota row the daemon reports for a login it has no saved account for. */
function LimitsRow({ quota, now }: { quota: AgentAccountLimits; now: number }) {
  return (
    <li className={ROW}>
      <div className="min-w-0">
        <span className="truncate text-sm font-medium">
          <EmailText text={quota.label} />
        </span>
        <div className="truncate text-xs text-muted-foreground">{quota.plan ?? quota.source}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <Quota quota={quota} now={now} />
      </div>
      <span />
    </li>
  );
}

function ImportForm({ agents }: { agents: { id: string; name: string }[] }) {
  const importAccount = useAgentsStore((state) => state.importAccount);
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const chosen = agentId || agents[0]?.id || "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen || !label.trim()) return;
    importAccount(chosen, label);
    setLabel("");
  };
  if (agents.length === 0) return null;
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-2 pt-1">
      <SelectMenu
        label="Agent for the new account"
        value={chosen}
        className="h-7 text-xs"
        options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
        onChange={setAgentId}
      />
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Label, for example client-x"
        aria-label="Account label"
        className="h-7 w-52 text-xs md:text-xs"
      />
      <Button type="submit" size="xs" variant="outline" disabled={!label.trim()}>
        Import current login
      </Button>
      <span className="text-xs text-muted-foreground">
        Sign in with the agent in a terminal first; this imports whoever is signed in now.
      </span>
    </form>
  );
}

/** Several logins per agent, one active, with the quota each has left and what the agents have spent. */
export function AccountsSection() {
  const {
    accounts,
    limits,
    detected,
    limitsError,
    refreshingLimits,
    lastSwitch,
    refreshLimits,
    removeAccount,
  } = useAgentsStore();
  const [removing, setRemoving] = useState<AccountInfo | null>(null);
  const now = Math.floor(Date.now() / 1000);
  const nameOf = (id: string) => detected.find((agent) => agent.id === id)?.displayName ?? id;
  const orphans = limits.filter((row) => !accounts.some((account) => account.id === row.accountId));
  const agentIds = [
    ...new Set([
      ...accounts.map((account) => account.agentId),
      ...orphans.map((row) => row.agentId),
    ]),
  ];
  const newest = limits.reduce((latest, row) => Math.max(latest, row.fetchedAt), 0);
  const importable = detected
    .filter((agent) => agent.installed)
    .map((agent) => ({ id: agent.id, name: agent.displayName }));

  return (
    <section aria-label="Accounts and usage" className="-mx-2 flex flex-col gap-3">
      <div className="flex items-center gap-2 px-2">
        <SectionLabel>Accounts and usage</SectionLabel>
        {newest > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Quota {lastUpdatedSentence(newest, now).replace(/^Last updated/, "updated")}
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          className={newest > 0 ? "" : "ml-auto"}
          disabled={refreshingLimits}
          onClick={refreshLimits}
        >
          {refreshingLimits ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {limitsError && (
        <p className="px-2 text-xs text-red-600 dark:text-red-400">
          {limitsError}{" "}
          <button type="button" className="underline underline-offset-2" onClick={refreshLimits}>
            Retry
          </button>
        </p>
      )}
      {agentIds.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">
          No accounts yet. Sign in, then import the login.
        </p>
      )}
      {agentIds.map((agentId) => (
        <div key={agentId} className="flex flex-col gap-1">
          <h3 className="px-2 text-sm font-medium">{nameOf(agentId)}</h3>
          <ul className="flex flex-col">
            {accounts
              .filter((account) => account.agentId === agentId)
              .map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  quota={limits.find((row) => row.accountId === account.id) ?? null}
                  now={now}
                  onRemove={() => setRemoving(account)}
                />
              ))}
            {orphans
              .filter((row) => row.agentId === agentId)
              .map((row) => (
                <LimitsRow key={row.accountId} quota={row} now={now} />
              ))}
          </ul>
          {lastSwitch?.agentId === agentId && (
            <p role="status" className="px-2 text-xs text-muted-foreground">
              {nameOf(agentId)} now uses {lastSwitch.label}.
            </p>
          )}
        </div>
      ))}
      <ImportForm agents={importable} />
      <SpendList nameOf={nameOf} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.label ?? "this account"}?`}
        description={`New ${removing ? nameOf(removing.agentId) : "agent"} sessions can no longer switch to this login.`}
        confirmLabel="Remove account"
        onConfirm={() => removing && removeAccount(removing.id)}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </section>
  );
}
