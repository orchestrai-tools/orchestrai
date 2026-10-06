import type { PullCheckRun, PullRequestFile } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { openExternalLink } from "../../lib/external-link";
import { groupPullFiles, type PullFileGroup } from "../../lib/pull-file-groups";
import { checkDot } from "./pull-meta";

/** A titled block in a detail pane; grouping by space, not by boxes. */
export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center text-xs font-medium text-muted-foreground">
        {title}
        {aside && <span className="ml-auto font-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

const ORDER: Record<string, number> = { failing: 0, pending: 1, passing: 2 };

/** Failures and running checks are what this is read for; passed checks fold into a count. */
export function ChecksList({
  checks,
  error,
  onRetry,
}: {
  checks: readonly PullCheckRun[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  const [showPassed, setShowPassed] = useState(false);
  if (error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        {error}{" "}
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onRetry}>
          Retry
        </Button>
      </p>
    );
  }
  if (!checks) return <p className="text-xs text-muted-foreground">Loading checks…</p>;
  if (checks.length === 0)
    return <p className="text-xs text-muted-foreground">No checks reported.</p>;
  const runs = [...checks].sort((a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3));
  const passed = runs.filter((run) => run.state === "passing");
  const shown = showPassed ? runs : runs.filter((run) => run.state !== "passing");
  return (
    <ul className="flex flex-col">
      {shown.map((run) => (
        <li key={run.name} className="group/check flex items-center gap-2 py-0.5 text-xs">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", checkDot(run.state))} />
          <span className="min-w-0 truncate font-mono" title={run.name}>
            {run.name}
          </span>
          {run.summary && (
            <span className="min-w-0 truncate text-muted-foreground" title={run.summary}>
              {run.summary}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted-foreground">
            {run.state === "pending" ? "running" : run.state}
          </span>
          {run.url && (
            <button
              type="button"
              aria-label={`Open ${run.name}`}
              onClick={() => void openExternalLink(run.url)}
              className="text-muted-foreground opacity-0 group-hover/check:opacity-100 hover:text-foreground focus-visible:opacity-100"
            >
              <ExternalLinkIcon className="size-3" />
            </button>
          )}
        </li>
      ))}
      {passed.length > 0 && (
        <li>
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs text-muted-foreground"
            onClick={() => setShowPassed((value) => !value)}
          >
            {showPassed ? "Hide passed checks" : `${passed.length} passed`}
          </Button>
        </li>
      )}
    </ul>
  );
}

/** The changed files, grouped by the kind of attention they need. A file opens in the diff. */
export function FilesChanged({
  files,
  error,
  additions,
  deletions,
  onOpenFile,
}: {
  files: readonly PullRequestFile[] | null;
  error: string | null;
  additions: number;
  deletions: number;
  onOpenFile: (path: string) => void;
}) {
  const summary = (
    <span className="font-mono tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>{" "}
      <span className="text-red-600 dark:text-red-400">−{deletions}</span>
    </span>
  );
  const count = files?.length ?? 0;
  const groups = files ? groupPullFiles(files) : [];
  return (
    <Section
      title={files ? `${count} ${count === 1 ? "file" : "files"} changed` : "Files changed"}
      aside={summary}
    >
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : !files ? (
        <p className="text-xs text-muted-foreground">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files changed.</p>
      ) : (
        groups.map((group) => (
          <FileGroup
            key={group.id}
            group={group}
            autoOpen={groups.length === 1}
            onOpenFile={onOpenFile}
          />
        ))
      )}
    </Section>
  );
}

function FileGroup({
  group,
  autoOpen,
  onOpenFile,
}: {
  group: PullFileGroup;
  autoOpen: boolean;
  onOpenFile: (path: string) => void;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? autoOpen;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOverride(!open)}
        className="flex items-center gap-1 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
        {group.label} · {group.files.length}
        <span className="ml-auto font-mono tabular-nums">
          {group.additions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">+{group.additions}</span>
          )}{" "}
          {group.deletions > 0 && (
            <span className="text-red-600 dark:text-red-400">−{group.deletions}</span>
          )}
        </span>
      </button>
      {open && (
        <ul className="pl-4">
          {group.files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onOpenFile(file.path)}
                className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left text-xs hover:underline"
                title={file.path}
              >
                <span className="truncate font-mono">{file.name}</span>
                {file.dir && <span className="truncate text-muted-foreground">{file.dir}</span>}
                <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">
                  +{file.additions} −{file.deletions}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
