import { ChevronRightIcon } from "lucide-react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { ProjectBadge } from "@/components/window/project-badge"
import { findAgent } from "@/data/agents"
import { KIND_LABEL, type InboxItem } from "@/data/inbox"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * Everything any agent is blocked on, across every project, newest first.
 * Opening a row goes straight to the task, where the approval or question waits.
 */
export function WaitingList({
  items,
  onOpen,
  onOpenInbox,
}: {
  items: InboxItem[]
  onOpen: (item: InboxItem) => void
  onOpenInbox: () => void
}) {
  return (
    <section aria-label="Waiting for you" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionLabel>Waiting for you</SectionLabel>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
        <Button variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={onOpenInbox}>
          Open Inbox
        </Button>
      </div>
      <ul className="overflow-hidden rounded-md border bg-background">
        {items.map((item) => {
          const project = findProject(item.project)
          return (
            <li key={item.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group/row flex w-full items-center gap-3 px-3 py-(--row-py) text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", item.risk === "high" ? "bg-red-500" : "bg-amber-500")} />
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[item.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <ProjectBadge project={project} className="size-3.5 text-[9px]" />
                  {project.name}
                </span>
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{findAgent(item.agent).name}</span>
                <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{item.time}</span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
