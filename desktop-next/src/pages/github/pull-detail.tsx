import { daemon } from "@warpforge/daemon";
import type { PullRequestSummary } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Textarea } from "@warpforge/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { ChevronDownIcon, EllipsisIcon, ExternalLinkIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { openExternalLink } from "../../lib/external-link";
import { usePullReview } from "../../lib/github-refresh";
import { reviewDecisionLabel } from "../../lib/review-decision";
import { useDaemon } from "../../lib/use-daemon";
import { PullAssistant } from "./pull-assistant";
import { PullMenuItems, SendToAgentItems, type PullHandlers } from "./pull-actions";
import { PullDiff } from "./pull-diff";
import { ago, errorText, isLive, pullTask, stateLabel } from "./pull-meta";
import { PullOverview } from "./pull-overview";
import { usePullDetail } from "./use-pull-detail";

type Tab = "overview" | "diff" | "assistant";
type Verdict = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

const VERDICT_SUBMIT: Record<Verdict, string> = {
  APPROVE: "Submit approval",
  REQUEST_CHANGES: "Submit change request",
  COMMENT: "Post review comment",
};

/** One pull request beside the list: what it is, where CI stands, who reviews it, and what you can do now. */
export function PullDetail({
  pull,
  handlers,
  onClose,
}: {
  pull: PullRequestSummary;
  handlers: PullHandlers;
  onClose: () => void;
}) {
  const { detail, error, checks, checksError, diff, diffError, unresolved, reload } = usePullDetail(
    pull.project,
    pull.number,
  );
  const state = useDaemon();
  const linked = pullTask(pull, state.snapshot.tasks, state.taskPullRequests);
  const [tab, setTab] = useState<Tab>("overview");
  const [openPath, setOpenPath] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [summary, setSummary] = useState("");
  const live = isLive(pull);
  const draft = detail?.draft ?? pull.draft;
  const decision = reviewDecisionLabel(detail?.reviewDecision ?? pull.reviewDecision);

  async function review(event: Verdict) {
    try {
      const url = await daemon.pullReview(pull.project, pull.number, event, summary);
      toast.success(
        event === "APPROVE"
          ? `Approved #${pull.number}`
          : event === "REQUEST_CHANGES"
            ? `Requested changes on #${pull.number}`
            : `Commented on #${pull.number}`,
        { description: url },
      );
      setSummary("");
      setVerdict(null);
    } catch (err) {
      toast.error(errorText(err, "Could not submit the review"));
    }
  }

  usePullReview({ draft, review: (event) => void review(event) });

  const verdictButton = (kind: Verdict, label: string) => {
    const blocked = draft && kind !== "COMMENT";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant={verdict === kind ? "secondary" : "outline"}
              size="xs"
              disabled={blocked}
              onClick={() => setVerdict(verdict === kind ? null : kind)}
            >
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {blocked
            ? "Draft pull requests cannot receive a review verdict"
            : kind === "REQUEST_CHANGES"
              ? "Request changes with a summary"
              : `${label} with an optional summary`}
        </TooltipContent>
      </Tooltip>
    );
  };
  const summaryRequired = verdict === "REQUEST_CHANGES" || verdict === "COMMENT";

  return (
    <aside aria-label={`Pull request #${pull.number}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            #{pull.number} · {stateLabel({ state: pull.state, draft })} ·{" "}
            {detail?.author?.login ?? pull.author?.login ?? "someone"}
            {decision && ` · ${decision}`} · {ago(pull.updatedAt)}
          </span>
          <div className="ml-auto flex shrink-0">
            <Button variant="ghost" size="icon-xs" aria-label="Refresh" onClick={reload}>
              <RotateCwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Open on GitHub"
              onClick={() => void openExternalLink(pull.url)}
            >
              <ExternalLinkIcon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`More for #${pull.number}`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <PullMenuItems pull={pull} handlers={handlers} taskId={linked?.task.id} />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </div>
        <h2 className="text-sm leading-snug font-semibold">{detail?.title ?? pull.title}</h2>
        {live && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {verdictButton("APPROVE", "Approve")}
            {verdictButton("REQUEST_CHANGES", "Request changes")}
            {verdictButton("COMMENT", "Comment")}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="xs">
                  Send to agent <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <SendToAgentItems pull={pull} handlers={handlers} unresolved={unresolved} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          value={tab}
          onValueChange={(next) => next && setTab(next as Tab)}
          aria-label="Show"
          className="pt-1"
        >
          <ToggleGroupItem value="overview" className="h-6 px-2 text-xs">
            Overview
          </ToggleGroupItem>
          <ToggleGroupItem value="diff" className="h-6 px-2 text-xs">
            Diff
            {detail && (
              <span className="text-muted-foreground tabular-nums">{detail.changedFiles}</span>
            )}
          </ToggleGroupItem>
          <ToggleGroupItem value="assistant" className="h-6 px-2 text-xs">
            Assistant
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {verdict && (
        <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3">
          <Textarea
            autoFocus
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!summaryRequired || summary.trim()) void review(verdict);
              }
            }}
            placeholder={summaryRequired ? "Summary (markdown)" : "Summary (optional, markdown)"}
            aria-label="Review summary"
            className="min-h-16 bg-background text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="xs" onClick={() => setVerdict(null)}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={summaryRequired && !summary.trim()}
              onClick={() => void review(verdict)}
            >
              {VERDICT_SUBMIT[verdict]}
              <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                ⌘↵
              </Kbd>
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}{" "}
            <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={reload}>
              Retry
            </Button>
          </p>
        ) : !detail ? (
          <p className="text-xs text-muted-foreground">Loading the pull request…</p>
        ) : tab === "overview" ? (
          <PullOverview
            pull={pull}
            detail={detail}
            checks={checks}
            checksError={checksError}
            diff={diff}
            diffError={diffError}
            unresolved={unresolved}
            handlers={handlers}
            onRetry={reload}
            onOpenDiff={() => setTab("diff")}
            onOpenFile={(path) => {
              setOpenPath(path);
              setTab("diff");
            }}
          />
        ) : tab === "diff" ? (
          diffError ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {diffError}{" "}
              <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={reload}>
                Retry
              </Button>
            </p>
          ) : (
            <PullDiff
              project={pull.project}
              number={pull.number}
              repo={pull.repo}
              patch={diff?.patch ?? ""}
              openPath={openPath}
              truncated={diff?.truncated}
            />
          )
        ) : (
          <PullAssistant pull={pull} detail={detail} diff={diff} />
        )}
      </div>
    </aside>
  );
}
