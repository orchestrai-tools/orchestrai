import { useState } from "react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { tasksFor, type Task } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { selectSelection } from "@/lib/window-store"
import { BoardColumns, TaskList } from "@/pages/board/task-views"

type View = "board" | "list"

/**
 * The project's board: agent work as one card per task (KLIDE, Antigravity).
 * Columns run in the order a person acts: what needs you first.
 */
export function BoardPage() {
  const project = useAppSession((session) => session.project)
  const selected = useAppSession((session) => selectSelection(session, "task"))
  const { select } = useAppActions()
  const [view, setView] = useState<View>("board")
  const tasks = tasksFor(project)
  const running = tasks.filter((task) => task.status === "running").length
  const open = (task: Task) => select("task", task.id, "task")

  return (
    <div className={cn("flex min-h-full flex-col gap-4 p-4", view === "board" && "dot-grid")}>
      <PageToolbar title="Board" meta={`${tasks.length} tasks · ${running} running`}>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(next) => next && setView(next as View)} aria-label="View">
          <ToggleGroupItem value="board" className="px-3 text-xs">Board</ToggleGroupItem>
          <ToggleGroupItem value="list" className="px-3 text-xs">List</ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>
      <div className="overflow-x-auto pb-2">
        {view === "board" ? (
          <BoardColumns tasks={tasks} selected={selected} open={open} />
        ) : (
          <TaskList tasks={tasks} selected={selected} open={open} />
        )}
      </div>
    </div>
  )
}
