import { useState } from "react"
import { ChevronDownIcon, EllipsisIcon, ExternalLinkIcon, XIcon } from "lucide-react"

import { MarkdownPage } from "@/components/common/markdown"
import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ME, type PullRequest } from "@/data/github"
import { findTask } from "@/data/tasks"
import { cn } from "@/lib/utils"
import { PullMenuItems, ReviewerItems, SendToAgentItems, type PullHandlers } from "@/pages/github/pull-actions"
import { authorLabel, REVIEW_LABEL, STATE_LABEL } from "@/pages/github/pull-meta"
import { AssistantSection, ChecksList, FilesChanged, FixLoop, Section } from "@/pages/github/pull-sections"

interface Props {
  pull: PullRequest
  actionsUrl: string
  handlers: PullHandlers
  onVerdict: (pull: PullRequest, verdict: "approved" | "changes-requested", summary: string) => void
  onMerge: (pull: PullRequest) => void
  onOpenInbox: () => void
  onClose: () => void
}

const REVIEWER_STATE = { requested: "Review requested", approved: "Approved", "changes-requested": "Changes requested", commented: "Commented" } as const

/** One pull request beside the list: what it is, where CI stands, who reviews it, and what you can do now. */
export function PullDetail({ pull, actionsUrl, handlers, onVerdict, onMerge, onOpenInbox, onClose }: Props) {
  const [verdict, setVerdict] = useState<"approved" | "changes-requested" | null>(null)
  const [summary, setSummary] = useState("")
  const task = findTask(pull.task)
  const live = pull.state === "open" || pull.state === "draft"
  const draft = pull.state === "draft"
  const mergeable = pull.state === "open" && pull.review === "approved" && pull.checks === "passing"

  const verdictButton = (kind: "approved" | "changes-requested", label: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant={verdict === kind ? "secondary" : "outline"} size="xs" disabled={draft || pull.author === ME} onClick={() => setVerdict(kind)}>
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {draft ? "A draft cannot receive a review verdict; mark it ready first" : pull.author === ME ? "GitHub does not let you review your own pull request" : `${label} with an optional summary`}
      </TooltipContent>
    </Tooltip>
  )

  return (
    <aside aria-label={`Pull request #${pull.number}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            #{pull.number} · {STATE_LABEL[pull.state]} · {authorLabel(pull)}
            {pull.agent && ` · opened as ${pull.author}`} · {pull.updated}
          </span>
          <div className="ml-auto flex shrink-0">
            <Button variant="ghost" size="icon-xs" aria-label="Open on GitHub" onClick={() => handlers.openOnGithub(pull)}>
              <ExternalLinkIcon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`More for #${pull.number}`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <PullMenuItems pull={pull} handlers={handlers} />
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </div>
        <h2 className="text-sm leading-snug font-semibold">{pull.title}</h2>
        {live && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {draft && (
              <Button size="xs" onClick={() => handlers.markReady(pull)}>
                Mark ready for review
              </Button>
            )}
            {mergeable && (
              <Button size="xs" onClick={() => onMerge(pull)}>
                Squash and merge…
              </Button>
            )}
            {verdictButton("approved", "Approve")}
            {verdictButton("changes-requested", "Request changes")}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="xs">
                  Request review <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <ReviewerItems pull={pull} handlers={handlers} />
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="xs">
                  Send to agent <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <SendToAgentItems pull={pull} handlers={handlers} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      {verdict && (
        <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3">
          <Textarea autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary (optional, markdown)" aria-label="Review summary" className="min-h-16 bg-background text-sm" />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="xs" onClick={() => setVerdict(null)}>Cancel</Button>
            <Button
              size="xs"
              onClick={() => {
                onVerdict(pull, verdict, summary)
                setVerdict(null)
                setSummary("")
              }}
            >
              {verdict === "approved" ? "Submit approval" : "Submit change request"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {task && (
          <Section title="Task">
            <button type="button" onClick={() => handlers.openTask(task.id)} className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline">
              <StatusMark status={task.status} />
              <span className="font-mono">{task.id}</span>
              <span className="truncate text-muted-foreground">{task.workflow} · stops at {task.stopPoints.join(", ")}</span>
            </button>
          </Section>
        )}
        <FixLoop pull={pull} onOpenInbox={onOpenInbox} />
        <Section title="Checks">
          <ChecksList pull={pull} actionsUrl={actionsUrl} />
        </Section>
        <Section title="Review" aside={REVIEW_LABEL[pull.review]}>
          {pull.reviewers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{draft ? "Nobody is asked yet. Mark it ready, then ask someone." : "Nobody is asked yet."}</p>
          ) : (
            <ul>
              {pull.reviewers.map((reviewer) => (
                <li key={reviewer.login} className="flex items-center gap-2 py-0.5 text-xs">
                  <span>{reviewer.login === ME ? `${ME} (you)` : reviewer.login}</span>
                  <span className={cn("ml-auto", reviewer.state === "changes-requested" ? "text-foreground" : "text-muted-foreground")}>{REVIEWER_STATE[reviewer.state]}</span>
                </li>
              ))}
            </ul>
          )}
          {pull.unresolved > 0 && <p className="text-xs text-muted-foreground">{pull.unresolved} unresolved {pull.unresolved === 1 ? "thread" : "threads"} on the diff</p>}
        </Section>
        <Section title="Branch">
          <p className="flex min-w-0 items-center gap-1.5 text-xs">
            <button type="button" onClick={() => handlers.copy(pull.branch, "branch name")} className="truncate font-mono hover:underline" title="Copy branch name">{pull.branch}</button>
            <span className="shrink-0 text-muted-foreground">into</span>
            <span className="shrink-0 font-mono">{pull.base}</span>
          </p>
        </Section>
        {pull.labels.length > 0 && (
          <Section title="Labels">
            <div className="flex flex-wrap gap-1">
              {pull.labels.map((label) => (
                <span key={label} className="rounded-sm border px-1.5 text-xs text-muted-foreground">{label}</span>
              ))}
            </div>
          </Section>
        )}
        <Section title="Description">
          <MarkdownPage markdown={pull.body || "_No description._"} />
        </Section>
        <FilesChanged pull={pull} />
        {live && <AssistantSection key={pull.number} pull={pull} />}
      </div>
    </aside>
  )
}
