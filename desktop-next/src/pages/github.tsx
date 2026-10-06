import type { BacklogItem, PullRequestSummary } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@warpforge/ui/components/resizable";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { EllipsisIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageToolbar } from "../components/common/page-toolbar";
import { openExternalLink } from "../lib/external-link";
import { useGithubRefresh } from "../lib/github-refresh";
import { isUnseen, markAllSeen, markSeen, useInboxSeen } from "../lib/inbox-seen";
import { useSelectedPull } from "../lib/selected-pull";
import { useShell } from "../lib/shell-store";
import { IssueDetail } from "./github/issue-detail";
import { issueClosed } from "./github/issue-meta";
import { IssueList } from "./github/issue-list";
import { LoadError } from "./github/list-controls";
import { sendPullToAgent, type PullHandlers } from "./github/pull-actions";
import { PullDetail } from "./github/pull-detail";
import { PullList } from "./github/pull-list";
import { StartTaskDialog } from "./github/start-task-dialog";
import { useIssues, usePulls } from "./github/use-github";

type Tab = "pulls" | "issues";

function GitHubRoom({ project }: { project: string }) {
  const openTask = useShell((state) => state.openTask);
  const setPage = useShell((state) => state.setPage);
  useInboxSeen((state) => state.tick);
  const pulls = usePulls(project);
  const issues = useIssues(project);
  const [tab, setTab] = useState<Tab>("pulls");
  const [selectedPull, setSelectedPull] = useState<number | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [starting, setStarting] = useState<BacklogItem | null>(null);
  const [started, setStarted] = useState<Record<string, string>>({});
  const pull = pulls.pulls.find((entry) => entry.number === selectedPull) ?? null;
  const issue = issues.issues.find((entry) => entry.id === selectedIssue) ?? null;
  const repo = pulls.pulls[0]?.repo;

  useEffect(() => {
    useSelectedPull.getState().select(tab === "pulls" ? pull : null);
  }, [pull, tab]);
  useEffect(() => () => useSelectedPull.getState().select(null), []);

  const openPull = useCallback((entry: PullRequestSummary) => {
    markSeen(entry);
    setSelectedPull(entry.number);
  }, []);
  const openIssue = useCallback((entry: BacklogItem) => setSelectedIssue(entry.id), []);
  const handlers: PullHandlers = {
    openTask: (id) => openTask(id, project),
    sendToAgent: (entry, intent) => void sendPullToAgent(entry, intent, null),
  };

  const openCount = pulls.pulls.filter((entry) => entry.state === "open").length;
  const issueCount = issues.issues.filter((entry) => !issueClosed(entry)).length;
  const error = tab === "pulls" ? pulls.error : issues.error;
  const listed = tab === "pulls" ? pulls.pulls.length : issues.issues.length;
  const detail =
    tab === "pulls" && pull ? (
      <PullDetail
        key={pull.number}
        pull={pull}
        handlers={handlers}
        onClose={() => setSelectedPull(null)}
      />
    ) : tab === "issues" && issue ? (
      <IssueDetail
        key={issue.id}
        issue={issue}
        started={started}
        onStart={() => setStarting(issue)}
        onOpenTask={handlers.openTask}
        onOpenBacklog={() => setPage("backlog")}
        onClose={() => setSelectedIssue(null)}
      />
    ) : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageToolbar title="GitHub" meta={repo} className="px-4 pt-4 pb-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={tab}
          onValueChange={(next) => next && setTab(next as Tab)}
          aria-label="Show"
        >
          <ToggleGroupItem value="pulls" className="gap-1.5 px-3 text-xs">
            Pull requests <span className="text-muted-foreground tabular-nums">{openCount}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="issues" className="gap-1.5 px-3 text-xs">
            Issues <span className="text-muted-foreground tabular-nums">{issueCount}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More for this repository">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => useGithubRefresh.getState().refresh()}>
              Refresh from GitHub
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!pulls.pulls.some((entry) => isUnseen(entry))}
              onSelect={() => markAllSeen(pulls.pulls)}
            >
              Mark all as read
            </DropdownMenuItem>
            {repo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void openExternalLink(`https://github.com/${repo}`)}
                >
                  Open {repo} on GitHub
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      {error && (
        <LoadError message={error} onRetry={tab === "pulls" ? pulls.reload : issues.reload} />
      )}

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="github-list" minSize="35%">
          <div className="flex h-full min-h-0 flex-col">
            {error && !listed ? null : tab === "pulls" ? (
              <PullList
                pulls={pulls.pulls}
                loading={pulls.loading}
                selected={pull?.number}
                onSelect={openPull}
                handlers={handlers}
              />
            ) : (
              <IssueList
                issues={issues.issues}
                loading={issues.loading}
                started={started}
                selected={issue?.id}
                onSelect={openIssue}
                onStart={setStarting}
                onOpenTask={handlers.openTask}
              />
            )}
          </div>
        </ResizablePanel>
        {detail && (
          <>
            <ResizableHandle />
            <ResizablePanel id="github-detail" defaultSize="42%" minSize="28%" maxSize="65%">
              {detail}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <StartTaskDialog
        project={project}
        issue={starting}
        onClose={() => setStarting(null)}
        onStarted={(itemId, taskId) => {
          setStarted((current) => ({ ...current, [itemId]: taskId }));
          issues.reload();
        }}
      />
    </div>
  );
}

/**
 * The project's repository on GitHub: pull requests and issues, read the way
 * GitHub answers them. A task's pull request names its task; an issue becomes
 * a task in one step, and the two then name each other.
 */
export function GitHub() {
  const project = useShell((state) => state.project);
  if (!project) {
    return (
      <div className="flex min-h-full flex-col gap-4 p-4">
        <PageToolbar title="GitHub" />
        <p className="py-10 text-center text-sm text-muted-foreground">
          Open a project to see its pull requests and issues.
        </p>
      </div>
    );
  }
  return <GitHubRoom key={project} project={project} />;
}
