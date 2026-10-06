import { useState, type ReactNode } from "react"
import { ExternalLinkIcon } from "lucide-react"

import { MarkdownPage } from "@/components/common/markdown"
import { Button } from "@/components/ui/button"
import type { PullRequest } from "@/data/github"
import { cn } from "@/lib/utils"
import { attemptsFor, changedFiles, checkRuns } from "@/pages/github/pull-meta"

const RUN_DOT = { passing: "bg-emerald-500", failing: "bg-red-500", pending: "bg-amber-500" } as const
const ATTEMPT_DOT = { failed: "bg-red-500", running: "bg-amber-500", passed: "bg-emerald-500" } as const

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center text-xs font-medium text-muted-foreground">
        {title}
        {aside && <span className="ml-auto font-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Failures and running checks are what this is read for; passed checks fold into a count. */
export function ChecksList({ pull, actionsUrl }: { pull: PullRequest; actionsUrl: string }) {
  const [showPassed, setShowPassed] = useState(false)
  const runs = checkRuns(pull)
  if (!runs.length) return <p className="text-xs text-muted-foreground">No checks run on this repository.</p>
  const passed = runs.filter((run) => run.status === "passing")
  const shown = showPassed ? runs : runs.filter((run) => run.status !== "passing")
  return (
    <ul className="flex flex-col">
      {shown.map((run) => (
        <li key={run.name} className="group/check flex items-center gap-2 py-0.5 text-xs">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", RUN_DOT[run.status])} />
          <span className="min-w-0 truncate font-mono">{run.name}</span>
          <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{run.status === "pending" ? "running" : run.duration}</span>
          <a href={actionsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${run.name} on GitHub`} className="text-muted-foreground opacity-0 group-hover/check:opacity-100 hover:text-foreground focus-visible:opacity-100">
            <ExternalLinkIcon className="size-3" />
          </a>
        </li>
      ))}
      {passed.length > 0 && (
        <li>
          <Button variant="link" size="xs" className="h-auto px-0 text-xs text-muted-foreground" onClick={() => setShowPassed((value) => !value)}>
            {showPassed ? "Hide passed checks" : `${passed.length} passed`}
          </Button>
        </li>
      )}
    </ul>
  )
}

/** The Shep ending, as the pull request sees it: each push of a fix and what CI said. */
export function FixLoop({ pull, onOpenInbox }: { pull: PullRequest; onOpenInbox: () => void }) {
  const attempts = attemptsFor(pull)
  if (!attempts) return null
  const atCap = attempts.used >= attempts.cap && pull.checks === "failing"
  return (
    <Section title="CI fix attempts" aside={`${attempts.used} of ${attempts.cap} used`}>
      <ol className="flex flex-col gap-0.5">
        {attempts.history.map((attempt) => (
          <li key={attempt.n} className="flex items-center gap-2 text-xs">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", ATTEMPT_DOT[attempt.result])} />
            <span className="w-16 shrink-0 text-muted-foreground">Attempt {attempt.n}</span>
            <span className="truncate">{attempt.detail}</span>
          </li>
        ))}
      </ol>
      {atCap ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          Stopped at the cap and asking what to do next.{" "}
          <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onOpenInbox}>Answer in Inbox</Button>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {attempts.cap - attempts.used} {attempts.cap - attempts.used === 1 ? "attempt" : "attempts"} left. At the cap the task stops and asks instead of trying again.
        </p>
      )}
    </Section>
  )
}

/** Documentation leads and folds, implementation follows open: the code is what the review is for. */
export function FilesChanged({ pull }: { pull: PullRequest }) {
  const [showDocs, setShowDocs] = useState(false)
  const { documentation, implementation } = changedFiles(pull)
  const summary = (
    <span className="font-mono tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">+{pull.additions}</span> <span className="text-red-600 dark:text-red-400">−{pull.deletions}</span>
    </span>
  )
  const row = (entry: { path: string; status: string; additions: number; deletions: number }) => (
    <li key={entry.path} className="flex items-center gap-2 py-0.5 text-xs">
      <span className="w-3 shrink-0 font-mono text-muted-foreground">{entry.status}</span>
      <span className="min-w-0 truncate font-mono" title={entry.path}>{entry.path}</span>
      <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">+{entry.additions} −{entry.deletions}</span>
    </li>
  )
  return (
    <Section title={`${pull.files} ${pull.files === 1 ? "file" : "files"} changed`} aside={summary}>
      {documentation.length + implementation.length === 0 ? (
        <p className="text-xs text-muted-foreground">The file list loads from GitHub; open the pull request there to read the diff.</p>
      ) : (
        <>
          {documentation.length > 0 && (
            <Button variant="link" size="xs" className="h-auto justify-start px-0 text-xs text-muted-foreground" onClick={() => setShowDocs((value) => !value)}>
              Documentation · {documentation.length} {showDocs ? "(hide)" : "(show)"}
            </Button>
          )}
          {showDocs && <ul>{documentation.map(row)}</ul>}
          <ul>{implementation.map(row)}</ul>
          {pull.files > documentation.length + implementation.length && (
            <p className="text-xs text-muted-foreground">and {pull.files - documentation.length - implementation.length} more already committed on the branch</p>
          )}
        </>
      )}
    </Section>
  )
}

function explain(pull: PullRequest) {
  return `**What it does.** ${pull.body.split("\n").find((line) => line && !line.startsWith("#") && !/^(Backlog|Closes|Fixes|Linear)/.test(line)) ?? pull.title}\n\n**Where.** ${pull.files} files on \`${pull.branch}\`, +${pull.additions} −${pull.deletions}.\n\n**Read first.** The change at the boundary the description names; the rest follows from it.`
}

function review(pull: PullRequest) {
  return pull.checks === "failing"
    ? `1. **CI is red.** Read the failing check before the code: the description says it is a race, so look for a wait on a fixed delay.\n2. No test covers the reconnect path the fix relies on.`
    : `1. **No blocking findings** in ${pull.files} files.\n2. Minor: one new public function has no doc comment.`
}

/** Asking about a change, in place. It answers here: nothing is posted to GitHub and no task is created. */
export function AssistantSection({ pull }: { pull: PullRequest }) {
  const [answer, setAnswer] = useState<{ kind: "explain" | "review"; text?: string } | null>(null)
  const ask = (kind: "explain" | "review") => {
    setAnswer({ kind })
    setTimeout(() => setAnswer({ kind, text: kind === "explain" ? explain(pull) : review(pull) }), 900)
  }
  return (
    <Section title="Ask Codex about this change" aside="answers here, posts nothing">
      <div className="flex gap-1.5">
        <Button variant="outline" size="xs" onClick={() => ask("explain")}>Explain</Button>
        <Button variant="outline" size="xs" onClick={() => ask("review")}>Review</Button>
      </div>
      {answer && (answer.text ? <MarkdownPage markdown={answer.text} className="rounded-md bg-muted/40 p-3 text-xs" /> : <p className="text-xs text-muted-foreground">Codex is reading the change once…</p>)}
    </Section>
  )
}
