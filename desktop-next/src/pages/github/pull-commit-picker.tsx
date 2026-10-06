import type { PullCommit } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import {
  commitRangeLabel,
  commitsNewestFirst,
  selectedCommitIndexes,
  toggleCommitInRange,
  type CommitRange,
} from "../../lib/pull-commits";
import { ago } from "./pull-meta";

/** Tick the commits whose patch should be shown. An empty range means the whole pull request. */
export function PullCommitPicker({
  commits,
  range,
  onRange,
}: {
  commits: readonly PullCommit[];
  range: CommitRange | null;
  onRange: (range: CommitRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (commits.length === 0) return null;
  const selected = selectedCommitIndexes(commits, range);
  const narrowed = selected.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
          {commitRangeLabel(commits, range)}
        </button>
        {narrowed && (
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs"
            onClick={() => onRange(null)}
          >
            All commits
          </Button>
        )}
      </div>
      {open && (
        <ul className="flex flex-col pl-4">
          {commitsNewestFirst(commits).map(({ commit, index }) => (
            <li key={commit.oid}>
              <label className="flex min-w-0 items-center gap-2 py-0.5 text-xs">
                {commits.length > 1 && (
                  <Checkbox
                    checked={selected.length === 0 || selected.includes(index)}
                    onCheckedChange={() => onRange(toggleCommitInRange(commits, range, index))}
                    aria-label={`Show ${commit.abbreviatedOid}`}
                  />
                )}
                <span className="shrink-0 font-mono text-muted-foreground">
                  {commit.abbreviatedOid}
                </span>
                <span className="min-w-0 truncate">{commit.messageHeadline}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {[commit.author?.login, ago(Math.floor(Date.parse(commit.committedDate) / 1000))]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
