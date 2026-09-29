import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { PULL_CHECKS_META } from "@/components/pullRequest/meta";
import { daemon } from "@/daemon";
import { openExternalLink } from "@/lib/externalLinks";
import { cn } from "@/lib/utils";
import type { PullCheckRun, PullChecks } from "@/protocol";

/** How often a pull request with checks still running is asked again. */
const PENDING_REFETCH_MS = 60_000;

const ORDER: Record<PullChecks, number> = { failing: 0, pending: 1, passing: 2 };

/**
 * Sort checks the way a reviewer triages them: failures, then running, then
 * passed, each group by name.
 * @param runs Checks in GitHub's order.
 * @returns A sorted copy.
 */
export function sortChecks(runs: readonly PullCheckRun[]): PullCheckRun[] {
  return [...runs].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
}

/**
 * The rail's Checks section: every check on the head commit, read-only.
 * Passed checks fold into one line; a failure or a running check is what the
 * section is consulted for.
 * @param props.project Local project the pull request belongs to.
 * @param props.number The pull request's number.
 * @returns The section's body.
 */
export function PullChecksList({ project, number }: { project: string; number: number }) {
  const query = useQuery({
    queryKey: ["pull", "checks", project, number],
    queryFn: () => daemon.pullChecks(project, number),
    staleTime: 30_000,
    retry: false,
    refetchInterval: (current) =>
      current.state.data?.some((run) => run.state === "pending") ? PENDING_REFETCH_MS : false,
  });
  const [showPassed, setShowPassed] = useState(false);

  if (query.isPending) {
    return <p className="text-[13px] text-muted-foreground/60">Reading checks…</p>;
  }
  if (query.isError) {
    return <p className="text-[13px] text-muted-foreground/60">Checks couldn't be read.</p>;
  }
  const runs = sortChecks(query.data);
  if (runs.length === 0) {
    return <p className="text-[13px] text-muted-foreground/60">No checks on the latest commit.</p>;
  }
  const passed = runs.filter((run) => run.state === "passing");
  const shown = showPassed ? runs : runs.filter((run) => run.state !== "passing");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {shown.map((run) => (
        <CheckLine key={`${run.name}\n${run.url}`} run={run} />
      ))}
      {passed.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPassed((value) => !value)}
          className="self-start text-[12px] text-muted-foreground hover:text-foreground"
        >
          {showPassed ? "Hide passed checks" : `${passed.length} passed`}
        </button>
      )}
    </div>
  );
}

function CheckLine({ run }: { run: PullCheckRun }) {
  const meta = PULL_CHECKS_META[run.state];
  const Icon = meta.icon;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px]" title={run.summary || run.name}>
      <Icon aria-label={meta.label} className={cn("size-3.5 shrink-0", meta.toneClass)} />
      <span className="min-w-0 flex-1 truncate text-foreground/85">{run.name}</span>
      {run.url && (
        <button
          type="button"
          aria-label={`Open ${run.name}`}
          onClick={() => void openExternalLink(run.url)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink aria-hidden className="size-3" />
        </button>
      )}
    </span>
  );
}
