import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { findAgent } from "@/data/agents"
import { KIND_LABEL, type InboxItem } from "@/data/inbox"
import { findTask } from "@/data/tasks"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

const RISK = {
  low: { label: "Low risk", note: "Reversible and local. It could run on its own under a looser profile.", tone: "text-muted-foreground" },
  medium: { label: "Medium risk", note: "Runs code inside the task's worktree. Reversible.", tone: "text-amber-600 dark:text-amber-400" },
  high: { label: "High risk", note: "Reaches the network and changes files outside the source tree. Needs a person.", tone: "text-red-600 dark:text-red-400" },
}

/** One request in full: what is asked, by whom, the risk gate, and the answers that unblock it. */
export function InboxDetail({
  item,
  onResolve,
  onOpenTask,
}: {
  item: InboxItem
  onResolve: (answer: string) => void
  onOpenTask: () => void
}) {
  const [choice, setChoice] = useState<string | undefined>(item.options?.[0])
  const task = findTask(item.task)
  const agent = findAgent(item.agent)
  const risk = RISK[item.risk]

  return (
    <article className="flex max-w-2xl flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          {KIND_LABEL[item.kind]} · {findProject(item.project).name} · {item.time} ago
        </p>
        <h2 className="text-base font-semibold">{item.title}</h2>
        <p className="text-xs text-muted-foreground">
          {agent.name} in{" "}
          <button type="button" onClick={onOpenTask} className="underline-offset-2 hover:underline">
            {task?.title}
          </button>
        </p>
      </header>

      {item.subject && <pre className="rounded-md bg-muted px-3 py-2 font-mono text-xs">{item.subject}</pre>}
      <p className="text-sm">{item.detail}</p>
      {item.kind === "permission" && (
        <p className={cn("text-xs", risk.tone)}>
          {risk.label}. <span className="text-muted-foreground">{risk.note}</span>
        </p>
      )}

      {item.kind === "permission" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onResolve("Approved once")}>
            Approve once <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">A</Kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => onResolve("Always allowed for this task")}>
            Always for this task
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => onResolve("Denied")}>
            Deny <Kbd>D</Kbd>
          </Button>
        </div>
      )}

      {(item.kind === "question" || item.kind === "ci") && item.options && (
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-2 text-xs text-muted-foreground">Choose one, or answer in your own words</legend>
          <div role="radiogroup" className="flex flex-col gap-1">
            {item.options.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-(--row-py) text-sm",
                  choice === option ? "border-foreground/40 bg-muted/60" : "hover:bg-muted/40"
                )}
              >
                <input type="radio" name={item.id} checked={choice === option} onChange={() => setChoice(option)} className="accent-foreground" />
                {option}
              </label>
            ))}
          </div>
          <Textarea placeholder="Or reply in your own words…" className="min-h-14" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onResolve(choice ?? "Replied")}>Send answer</Button>
            <Button size="sm" variant="outline" onClick={onOpenTask}>Open task</Button>
          </div>
        </fieldset>
      )}

      {item.kind === "review" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onResolve("Opened for review")}>Review the diff</Button>
          <Button size="sm" variant="outline" onClick={onOpenTask}>Open task</Button>
        </div>
      )}
    </article>
  )
}
