import { ArrowUpIcon, AtSignIcon, PaperclipIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { findAgent } from "@/data/agents"
import type { Task } from "@/data/tasks"

/**
 * The composer adds what the wrapped agent cannot do itself: project context,
 * attachments, and mentions across tasks. The agent keeps its own slash
 * commands and history (DESIGN-PHILOSOPHY §14).
 */
export function Composer({ task }: { task: Task }) {
  const agent = findAgent(task.agent)
  return (
    <div className="rounded-md border bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring/40">
      <textarea
        aria-label={`Message ${agent.name}`}
        placeholder={`Message ${agent.name} about this task. @ mentions files, docs, and other tasks.`}
        rows={2}
        className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <Button variant="ghost" size="icon-xs" aria-label="Mention a file, doc, or task">
          <AtSignIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Attach">
          <PaperclipIcon />
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {agent.name} · {task.autonomy} · {agent.permissionProfile}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <Kbd>⌘↵</Kbd>
          <Button size="icon-xs" aria-label="Send">
            <ArrowUpIcon />
          </Button>
        </span>
      </div>
    </div>
  )
}
