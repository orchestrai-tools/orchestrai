import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { findAgent } from "@/data/agents"
import { INBOX } from "@/data/inbox"
import type { TaskDetail } from "@/data/task-detail"
import type { Task } from "@/data/tasks"
import { cn } from "@/lib/utils"

const RISK_NOTE = {
  low: "Low risk: reversible and local.",
  medium: "Medium risk: runs code in the worktree. Reversible.",
  high: "High risk: reaches the network and changes the lockfile.",
}

function Frame({ tone, label, children }: { tone: "amber" | "red" | "sky"; label: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-md border-l-2 bg-muted/50 px-4 py-3",
        tone === "amber" && "border-l-amber-500",
        tone === "red" && "border-l-red-500",
        tone === "sky" && "border-l-sky-500"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </section>
  )
}

/**
 * Whatever this task needs from a person, at the top of its page: an
 * approval gated by risk, a stop that says why and what continues it, or a
 * pull request waiting at the merge stop.
 */
export function AttentionCard({ task, detail }: { task: Task; detail: TaskDetail }) {
  const [answered, setAnswered] = useState<string | null>(null)
  const request = INBOX.find((item) => item.task === task.id && item.kind === "permission")
  const agent = findAgent(task.agent)

  if (answered) {
    return (
      <p className="rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        Sent “{answered}”. {agent.name} continues; the receipt is in the inspector.
      </p>
    )
  }

  if (request) {
    return (
      <Frame tone="amber" label={`${agent.name} is asking permission`}>
        <p className="text-sm font-medium">{request.title}</p>
        <pre className="rounded-sm bg-background px-3 py-2 font-mono text-xs">{request.subject}</pre>
        <p className="text-xs text-muted-foreground">
          {request.detail} {RISK_NOTE[request.risk]}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAnswered("Approve once")}>Approve once</Button>
          <Button size="sm" variant="outline" onClick={() => setAnswered("Always for this task")}>Always for this task</Button>
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setAnswered("Deny")}>Deny</Button>
        </div>
      </Frame>
    )
  }

  if (detail.handoff) {
    return (
      <Frame tone={task.status === "failed" ? "red" : "amber"} label={`Stopped at ${task.stage} · handed to you`}>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">It was about to</dt>
            <dd>{detail.handoff.aboutTo}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">It was unsure about</dt>
            <dd>{detail.handoff.unsure}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {detail.handoff.options.map((option, index) => (
            <Button key={option} size="sm" variant={index === 0 ? "default" : "outline"} onClick={() => setAnswered(option)}>
              {option}
            </Button>
          ))}
        </div>
      </Frame>
    )
  }

  if (task.status === "review" && task.pr) {
    return (
      <Frame tone="sky" label="Waiting at the merge stop">
        <p className="text-sm">
          Draft PR #{task.pr.number} is open with checks {task.pr.checks}. The run stopped at merge, as set.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Review the diff</Button>
          <Button size="sm" variant="outline">Mark ready for review</Button>
          <Button size="sm" variant="outline">Ask for changes</Button>
        </div>
      </Frame>
    )
  }

  return null
}
