import type { ReactNode } from "react"

import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import type { PullRequest } from "@/data/github"
import { REVIEWERS } from "@/pages/github/pull-meta"

/** What a pull request offers, wherever it is shown: its row menu and its detail share one list. */
export interface PullHandlers {
  openTask: (id: string) => void
  openOnGithub: (pull: PullRequest) => void
  markReady: (pull: PullRequest) => void
  requestReview: (pull: PullRequest, login: string) => void
  sendToAgent: (pull: PullRequest, intent: "comments" | "branch") => void
  copy: (text: string, what: string) => void
  close: (pull: PullRequest) => void
  url: (pull: PullRequest) => string
}

export function ReviewerItems({ pull, handlers }: { pull: PullRequest; handlers: PullHandlers }) {
  return (
    <>
      <DropdownMenuLabel>Ask for a review</DropdownMenuLabel>
      {REVIEWERS[pull.project].map((login) => {
        const asked = pull.reviewers.some((reviewer) => reviewer.login === login)
        return (
          <DropdownMenuCheckboxItem key={login} checked={asked} disabled={asked} onSelect={() => handlers.requestReview(pull, login)}>
            {login}
          </DropdownMenuCheckboxItem>
        )
      })}
    </>
  )
}

export function SendToAgentItems({ pull, handlers }: { pull: PullRequest; handlers: PullHandlers }) {
  return (
    <>
      <DropdownMenuLabel>Hand the work to an agent, as a task on the board</DropdownMenuLabel>
      <DropdownMenuItem className="flex-col items-start gap-0" disabled={pull.unresolved === 0} onSelect={() => handlers.sendToAgent(pull, "comments")}>
        <span>Address review comments{pull.unresolved > 0 && <span className="ml-1.5 text-muted-foreground tabular-nums">{pull.unresolved}</span>}</span>
        <span className="text-xs text-muted-foreground">{pull.unresolved ? "Starts a task on this branch to fix them, commit and push" : "Nothing unresolved on this pull request"}</span>
      </DropdownMenuItem>
      <DropdownMenuItem className="flex-col items-start gap-0" onSelect={() => handlers.sendToAgent(pull, "branch")}>
        <span>Work on this branch</span>
        <span className="text-xs text-muted-foreground">Starts a task that picks the change up where it left off</span>
      </DropdownMenuItem>
    </>
  )
}

/** The row's ⋯ menu: the most used first, copying next, and closing last. */
export function PullMenuItems({ pull, handlers, extra }: { pull: PullRequest; handlers: PullHandlers; extra?: ReactNode }) {
  const live = pull.state === "open" || pull.state === "draft"
  return (
    <>
      {pull.task && <DropdownMenuItem onSelect={() => handlers.openTask(pull.task!)}>Open task {pull.task}</DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => handlers.openOnGithub(pull)}>Open on GitHub</DropdownMenuItem>
      {extra}
      {pull.state === "draft" && <DropdownMenuItem onSelect={() => handlers.markReady(pull)}>Mark ready for review</DropdownMenuItem>}
      {live && (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Request review</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <ReviewerItems pull={pull} handlers={handlers} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Send to agent</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-80">
              <SendToAgentItems pull={pull} handlers={handlers} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => handlers.copy(handlers.url(pull), "link")}>Copy link</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => handlers.copy(pull.branch, "branch name")}>Copy branch name</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => handlers.copy(`[${pull.title}](${handlers.url(pull)})`, "title as a link")}>Copy title as a link</DropdownMenuItem>
      {live && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => handlers.close(pull)}>Close pull request…</DropdownMenuItem>
        </>
      )}
    </>
  )
}
