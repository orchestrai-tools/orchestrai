import { SPEND_DISCLAIMER, formatUsd } from "@warpforge/core/spend";
import { daemon } from "@warpforge/daemon";
import type { AccountInfo, AgentAccountLimits, AgentConfig, AgentSpend } from "@warpforge/protocol";
import { Badge } from "@warpforge/ui/components/badge";
import { Button } from "@warpforge/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@warpforge/ui/components/popover";
import { Separator } from "@warpforge/ui/components/separator";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { EmailText } from "../../components/email-text";
import { accountsForMenu, chipLabel, quotaLeft } from "../../lib/account-chip";
import { useDaemon } from "../../lib/use-daemon";

function QuotaWindows({ limits }: { limits?: AgentAccountLimits }) {
  if (!limits || limits.windows.length === 0) return null;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {limits.windows
        .map((window) => `${window.label} ${quotaLeft(window.usedPercent)}% left`)
        .join(" · ")}
    </span>
  );
}

function SpendNote({ spend }: { spend?: AgentSpend }) {
  if (!spend) return null;
  if (!spend.reported) {
    return (
      <p className="text-xs text-muted-foreground" title={SPEND_DISCLAIMER}>
        Spend not reported
      </p>
    );
  }
  const today = formatUsd(spend.todayUsd);
  const total = formatUsd(spend.totalUsd);
  if (!today && !total) return null;
  return (
    <p className="text-xs text-muted-foreground" title={SPEND_DISCLAIMER}>
      {[today && `Today ${today}`, total && `Total ${total}`].filter(Boolean).join(" · ")} ·{" "}
      {SPEND_DISCLAIMER}
    </p>
  );
}

function AccountRow({ account, limits }: { account: AccountInfo; limits?: AgentAccountLimits }) {
  return (
    <li>
      <button
        type="button"
        disabled={account.active}
        onClick={() =>
          void daemon.setActiveAccount(account.agentId, account.id).catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Could not switch account");
          })
        }
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-default",
          account.active && "bg-muted/60",
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">
            <EmailText text={account.label} />
            {account.email && account.email !== account.label && (
              <span className="text-muted-foreground">
                {" "}
                · <EmailText text={account.email} />
              </span>
            )}
          </span>
          {account.plan && <Badge variant="secondary">{account.plan}</Badge>}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {account.active ? "Active" : "Use"}
          </span>
        </span>
        <QuotaWindows limits={limits} />
      </button>
    </li>
  );
}

/** Which login the agent runs on, its quota windows, and a switch to another account. */
export function AccountMenu({
  agentId,
  agents,
  accounts,
}: {
  agentId: string;
  agents: AgentConfig[];
  accounts: AccountInfo[];
}) {
  const state = useDaemon();
  const limits = state.agentLimits ?? [];
  const spend = (state.agentSpend ?? []).find((row) => row.agentId === agentId);
  const displayName = agents.find((agent) => agent.id === agentId)?.displayName || agentId;
  const menu = accountsForMenu(agentId, accounts);

  useEffect(() => {
    if (limits.length > 0 && state.agentSpend) return;
    if (limits.length === 0) void daemon.listAgentLimits().catch(() => undefined);
    if (!state.agentSpend) void daemon.listAgentSpend().catch(() => undefined);
  }, [limits.length, state.agentSpend]);

  if (menu.length === 0) return <span>{displayName}</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${displayName} account`}
          className="inline-flex items-center gap-0.5 rounded-sm hover:text-foreground"
        >
          {chipLabel(agentId, displayName, accounts)}
          <ChevronDownIcon aria-hidden className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Accounts</p>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() =>
              void daemon.listAgentLimits(true).catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : "Could not refresh the quota");
              })
            }
          >
            <RefreshCwIcon />
            Refresh quota
          </Button>
        </div>
        <ul className="flex flex-col gap-0.5">
          {menu.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              limits={limits.find((row) => row.accountId === account.id)}
            />
          ))}
        </ul>
        <Separator />
        <SpendNote spend={spend} />
        <PopoverDescription className="text-xs">
          Open sessions resume on the new account with your next message.
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
