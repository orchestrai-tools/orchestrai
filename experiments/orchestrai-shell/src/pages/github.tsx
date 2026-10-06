import { useState } from "react"
import { EllipsisIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { issuesFor, ME, type Issue, type PullRequest } from "@/data/github"
import { useAppActions, useAppId, useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import { ConfirmRequestDialog, type ConfirmRequest } from "@/components/common/confirm-dialog"
import { PageToast } from "@/pages/changes/page-toast"
import { say } from "@/pages/changes/toast-store"
import { issueSource, useGithubStore, usePulls, type GithubTab } from "@/pages/github/github-store"
import { IssueDetail } from "@/pages/github/issue-detail"
import { IssueList } from "@/pages/github/issue-list"
import type { PullHandlers } from "@/pages/github/pull-actions"
import { PullDetail } from "@/pages/github/pull-detail"
import { PullList } from "@/pages/github/pull-list"
import { pullUrl } from "@/pages/github/pull-meta"
import { StartTaskDialog, type StartRequest } from "@/pages/github/start-task-dialog"

const firstParagraph = (body: string) => body.split("\n\n").find((part) => part.trim() && !part.startsWith("#") && !/^(Backlog|Closes|Fixes|Linear):?/.test(part)) ?? ""

/**
 * The project's repository on GitHub: pull requests and issues, read the way
 * GitHub answers them. A task's pull request says how its CI fix loop stands;
 * an issue becomes a task in one step, and the two then name each other.
 */
export function GithubPage() {
  const app = useAppId()
  const project = useAppSession((session) => session.project)
  const { select, setPage } = useAppActions()
  const key = `${app}:${project}`
  const tab = useGithubStore((store) => store.tab[key]) ?? "pulls"
  const selectedPull = useGithubStore((store) => store.selectedPull[key])
  const selectedIssue = useGithubStore((store) => store.selectedIssue[key])
  const { setTab, selectPull, selectIssue, patchPull } = useGithubStore.getState()
  const pulls = usePulls(project)
  const issues = issuesFor(project)
  const repo = findProject(project).repo
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [start, setStart] = useState<StartRequest | null>(null)
  const pull = pulls.find((entry) => entry.number === selectedPull)
  const issue = issues.find((entry) => entry.number === selectedIssue)

  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => say(`Copied ${what}`), () => say(`Could not copy the ${what}`, "error"))
  const openPull = (number: number) => {
    setTab(key, "pulls")
    selectPull(key, number)
    if (pulls.find((entry) => entry.number === number)?.unseen) patchPull(project, number, { unseen: false })
  }
  const startFromIssue = (entry: Issue) =>
    setStart({ source: issueSource(project, entry.number), label: `#${entry.number}`, goal: `${entry.title}\n\n${entry.body}`, taskId: `gh-${entry.number}`, closes: `Closes #${entry.number}` })

  const handlers: PullHandlers = {
    openTask: (id) => select("task", id, "task"),
    openOnGithub: (entry) => window.open(pullUrl(entry, repo), "_blank", "noopener"),
    url: (entry) => pullUrl(entry, repo),
    copy,
    markReady: (entry) => {
      patchPull(project, entry.number, { state: "open", review: "review-required" })
      say(`#${entry.number} is ready for review; CODEOWNERS were asked`)
    },
    requestReview: (entry, login) => {
      patchPull(project, entry.number, { reviewers: [...entry.reviewers, { login, state: "requested" }], review: entry.review === "none" ? "review-required" : entry.review })
      say(`Asked ${login} to review #${entry.number}`)
    },
    sendToAgent: (entry, intent) => {
      const checkout = `Start with: git fetch origin ${entry.branch} && git switch ${entry.branch}`
      setStart({
        source: `pull:${project}#${entry.number}:${intent}`,
        label: `#${entry.number}`,
        taskId: `pr-${entry.number}${intent === "comments" ? "-review" : ""}`,
        closes: `Updates #${entry.number}`,
        goal:
          intent === "comments"
            ? `Address the ${entry.unresolved} unresolved review comments on #${entry.number} (${entry.title}). Commit and push when they are fixed.\n\n${checkout}`
            : `Keep building #${entry.number}: ${entry.title}.\n\n${firstParagraph(entry.body)}\n\n${checkout}`,
      })
    },
    close: (entry) =>
      setConfirm({
        title: `Close #${entry.number} without merging?`,
        description: entry.task ? `The branch stays, and task ${entry.task} keeps its worktree. A Factory task's backlog item goes back to To do.` : "The branch stays on GitHub. You can reopen it there.",
        items: [`#${entry.number} ${entry.title}`],
        confirmLabel: "Close pull request",
        destructive: true,
        onConfirm: () => {
          patchPull(project, entry.number, { state: "closed" })
          say(`Closed #${entry.number}`)
        },
      }),
  }

  const onVerdict = (entry: PullRequest, verdict: "approved" | "changes-requested", summary: string) => {
    const reviewers = [...entry.reviewers.filter((reviewer) => reviewer.login !== ME), { login: ME, state: verdict }]
    patchPull(project, entry.number, { review: verdict, reviewers })
    say(`${verdict === "approved" ? "Approved" : "Requested changes on"} #${entry.number}${summary.trim() ? " with a summary" : ""}`)
  }
  const onMerge = (entry: PullRequest) =>
    setConfirm({
      title: `Squash and merge #${entry.number}?`,
      description: `Its commits become one commit on ${entry.base}, and the branch is deleted on GitHub. Checks are passing and the review is approved.`,
      items: [`${entry.branch} → ${entry.base}`],
      confirmLabel: "Squash and merge",
      onConfirm: () => {
        patchPull(project, entry.number, { state: "merged" })
        say(`Merged #${entry.number} into ${entry.base}`)
      },
    })

  const openCount = pulls.filter((entry) => entry.state === "open" || entry.state === "draft").length
  const issueCount = issues.filter((entry) => entry.state === "open").length
  const detail =
    tab === "pulls" && pull ? (
      <PullDetail
        key={pull.number}
        pull={pull}
        actionsUrl={`https://github.com/${repo}/actions`}
        handlers={handlers}
        onVerdict={onVerdict}
        onMerge={onMerge}
        onOpenInbox={() => setPage("inbox")}
        onClose={() => selectPull(key, undefined)}
      />
    ) : tab === "issues" && issue ? (
      <IssueDetail
        key={issue.number}
        issue={issue}
        url={`https://github.com/${repo}/issues/${issue.number}`}
        fix={pulls.find((entry) => entry.number === issue.closedBy)}
        onStart={() => startFromIssue(issue)}
        onOpenTask={handlers.openTask}
        onOpenPull={openPull}
        onOpenBacklog={() => setPage("backlog")}
        onClose={() => selectIssue(key, undefined)}
      />
    ) : null

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageToolbar title="GitHub" meta={repo} className="px-4 pt-4 pb-3">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={tab} onValueChange={(next) => next && setTab(key, next as GithubTab)} aria-label="Show">
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
            <DropdownMenuItem onSelect={() => say(`Up to date with ${repo} · checked just now`)}>Refresh from GitHub</DropdownMenuItem>
            <DropdownMenuItem disabled={!pulls.some((entry) => entry.unseen)} onSelect={() => pulls.filter((entry) => entry.unseen).forEach((entry) => patchPull(project, entry.number, { unseen: false }))}>
              Mark all as read
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => window.open(`https://github.com/${repo}`, "_blank", "noopener")}>Open {repo} on GitHub</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="github-list" minSize="35%">
          <div className="flex h-full min-h-0 flex-col">
            {tab === "pulls" ? (
              <PullList key={project} pulls={pulls} selected={pull?.number} onSelect={openPull} handlers={handlers} />
            ) : (
              <IssueList
                key={project}
                issues={issues}
                selected={issue?.number}
                onSelect={(number) => selectIssue(key, number)}
                onStart={startFromIssue}
                onOpenTask={handlers.openTask}
                url={(entry) => `https://github.com/${repo}/issues/${entry.number}`}
              />
            )}
          </div>
        </ResizablePanel>
        {detail && (
          <>
            <ResizableHandle />
            <ResizablePanel id="github-detail" defaultSize="42%" minSize="28%" maxSize="60%">
              {detail}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
      <StartTaskDialog request={start} onClose={() => setStart(null)} />
      <PageToast />
    </div>
  )
}
