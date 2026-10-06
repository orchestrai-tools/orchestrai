import { ExternalLinkIcon, XIcon } from "lucide-react"

import { MarkdownPage } from "@/components/common/markdown"
import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import type { Issue, PullRequest } from "@/data/github"
import { useIssueTask } from "@/pages/github/github-store"
import { CHECK_LABEL, STATE_LABEL } from "@/pages/github/pull-meta"
import { Section } from "@/pages/github/pull-sections"

interface Props {
  issue: Issue
  url: string
  /** The pull request whose body closes this issue, when there is one. */
  fix?: PullRequest
  onStart: () => void
  onOpenTask: (id: string) => void
  onOpenPull: (number: number) => void
  onOpenBacklog: () => void
  onClose: () => void
}

/** One issue beside the list, with the one action it usually needs: a task that closes it. */
export function IssueDetail({ issue, url, fix, onStart, onOpenTask, onOpenPull, onOpenBacklog, onClose }: Props) {
  const { task, started } = useIssueTask(issue)
  const open = issue.state === "open"
  return (
    <aside aria-label={`Issue #${issue.number}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            #{issue.number} · {open ? "Open" : "Closed"} · opened by {issue.author} · {issue.updated}
          </span>
          <div className="ml-auto flex shrink-0">
            <Button variant="ghost" size="icon-xs" aria-label="Open on GitHub" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
              </a>
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </div>
        <h2 className="text-sm leading-snug font-semibold">{issue.title}</h2>
        {open && (
          <div className="flex gap-1.5 pt-1">
            {task ? (
              <Button size="xs" variant="outline" onClick={() => onOpenTask(task.id)}>Open task {task.id}</Button>
            ) : started ? (
              <span className="text-xs text-muted-foreground">Task {started.id} is queued with {started.workflow}; its pull request will say “{started.closes}”.</span>
            ) : (
              <Button size="xs" onClick={onStart}>Start task from #{issue.number}…</Button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {task && (
          <Section title="Task">
            <button type="button" onClick={() => onOpenTask(task.id)} className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline">
              <StatusMark status={task.status} />
              <span className="font-mono">{task.id}</span>
              <span className="truncate text-muted-foreground">{task.summary}</span>
            </button>
          </Section>
        )}
        {fix && (
          <Section title={issue.state === "closed" ? "Closed by" : "Fixed in"}>
            <button type="button" onClick={() => onOpenPull(fix.number)} className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline">
              <span className="font-mono">#{fix.number}</span>
              <span className="truncate">{fix.title}</span>
              <span className="shrink-0 text-muted-foreground">
                {STATE_LABEL[fix.state]} · {CHECK_LABEL[fix.checks].toLowerCase()}
              </span>
            </button>
          </Section>
        )}
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Board</dt>
          <dd title="Read from the repository's Projects board; Orchestrai never writes it back">{issue.column ?? "Not on a board"}</dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd>{issue.assignee ?? "Nobody"}</dd>
          <dt className="text-muted-foreground">Labels</dt>
          <dd className="flex flex-wrap gap-1">
            {issue.labels.map((label) => (
              <span key={label} className="rounded-sm border px-1.5 text-xs text-muted-foreground">{label}</span>
            ))}
          </dd>
          {open && (
            <>
              <dt className="text-muted-foreground">Backlog</dt>
              <dd>
                <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onOpenBacklog}>
                  Imported as #{issue.number}; set its priority there
                </Button>
              </dd>
            </>
          )}
        </dl>
        <Section title="Description">
          <MarkdownPage markdown={issue.body} />
        </Section>
      </div>
    </aside>
  )
}
