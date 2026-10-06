import { useState } from "react"

import { PageToolbar, SectionLabel } from "@/components/common/page-toolbar"
import { SelectMenu, type SelectOption } from "@/components/common/select-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { INBOX, type InboxItem } from "@/data/inbox"
import { findTask, TASKS, type Task } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { PROJECTS, type ProjectId } from "@/lib/projects"
import { BoardColumns, TaskList } from "@/pages/board/task-views"
import { WaitingList } from "@/pages/home/waiting-list"

type View = "board" | "list"
const ALL = "all"

const PROJECT_OPTIONS: readonly SelectOption[] = [
  { value: ALL, label: "All projects" },
  ...PROJECTS.map((project) => ({ value: project.id, label: project.name, hint: project.repo })),
]

/**
 * The pinned Home tab: attention across every project. Projects stay where
 * things live; Home is where you see what needs you and what is running.
 * Opening anything here jumps into its project.
 */
export function HomePage() {
  const { selectProject, select } = useAppActions()
  const current = useAppSession((session) => session.project)
  const [filter, setFilter] = useState<ProjectId | typeof ALL>(ALL)
  const [view, setView] = useState<View>("board")

  const tasks = TASKS.filter((task) => filter === ALL || task.project === filter)
  const waiting = INBOX.filter((item) => filter === ALL || item.project === filter)
  const running = tasks.filter((task) => task.status === "running").length
  const projects = new Set(tasks.map((task) => task.project)).size

  const openTask = (task: Task) => {
    selectProject(task.project)
    select("task", task.id, "task")
  }
  const openWaiting = (item: InboxItem) => {
    const task = findTask(item.task)
    if (task) openTask(task)
  }
  const openInbox = () => {
    selectProject(current)
    select("inbox", "all", "inbox")
  }

  return (
    <div className="dot-grid flex min-h-full flex-col gap-6 p-4">
      <PageToolbar title="Home" meta={`${tasks.length} tasks in ${projects} projects · ${running} running`}>
        <SelectMenu label="Project" value={filter} options={PROJECT_OPTIONS} onChange={(next) => setFilter(next as ProjectId | typeof ALL)} className="h-7 w-44 text-xs" />
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(next) => next && setView(next as View)} aria-label="View">
          <ToggleGroupItem value="board" className="px-3 text-xs">Board</ToggleGroupItem>
          <ToggleGroupItem value="list" className="px-3 text-xs">List</ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>

      {waiting.length > 0 && <WaitingList items={waiting} onOpen={openWaiting} onOpenInbox={openInbox} />}

      <section aria-label="Every task" className="flex flex-col gap-2">
        <SectionLabel>Every task</SectionLabel>
        <div className="overflow-x-auto pb-2">
          {view === "board" ? (
            <BoardColumns tasks={tasks} open={openTask} showProject />
          ) : (
            <TaskList tasks={tasks} open={openTask} showProject />
          )}
        </div>
      </section>
    </div>
  )
}
