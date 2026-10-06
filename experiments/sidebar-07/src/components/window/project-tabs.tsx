import { useRef, type KeyboardEvent } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import { ProjectBadge, ProjectStatus } from "@/components/window/project-badge"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { findProject, PROJECTS, type ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }

/**
 * TradingView-style tabs in the title bar, one per open project. Tabs span
 * the bar's height; the active one is filled with the content's colour so it
 * reads as part of the page, and inactive neighbours are split by a
 * hairline. Arrow keys move between tabs (Home and End jump to the ends).
 */
export function ProjectTabs() {
  const { openProjects, project } = useAppSession(
    useShallow((session) => ({ openProjects: session.openProjects, project: session.project }))
  )
  const { selectProject, closeProject, newProjectTab } = useAppActions()
  const list = useRef<HTMLDivElement>(null)

  const activate = (id: ProjectId) => {
    selectProject(id)
    list.current?.querySelector<HTMLElement>(`[data-project="${id}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const last = openProjects.length - 1
    const index = openProjects.indexOf(project)
    const target =
      event.key === "Home" ? 0 : event.key === "End" ? last : index + (ARROW_STEP[event.key] ?? NaN)
    if (Number.isNaN(target)) return
    event.preventDefault()
    activate(openProjects[(target + openProjects.length) % openProjects.length])
  }

  return (
    <div className="flex min-w-0 items-stretch gap-1">
      <div
        ref={list}
        role="tablist"
        aria-label="Projects"
        onKeyDown={onKeyDown}
        className="flex min-w-0 items-stretch"
      >
        {openProjects.map((id, index) => {
          const tab = findProject(id)
          const active = id === project
          const afterActive = openProjects[index - 1] === project
          return (
            <div
              key={id}
              className={cn(
                "group/tab @container relative flex w-56 min-w-24 shrink items-center text-[12px]",
                // The active tab takes the content's colour and covers the bar's bottom border, so it joins the page below.
                active ? "z-10 -mb-px bg-background" : "hover:bg-foreground/5",
                index > 0 &&
                  !active &&
                  !afterActive &&
                  "before:absolute before:left-0 before:h-4 before:w-px before:bg-foreground/15 group-hover/tab:before:opacity-0"
              )}
            >
              <button
                type="button"
                role="tab"
                data-project={id}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => selectProject(id)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 pr-8 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <ProjectBadge project={tab} />
                <span
                  className={cn(
                    "truncate",
                    active ? "font-medium text-foreground" : "text-foreground/70"
                  )}
                >
                  {tab.name}
                </span>
                <ProjectStatus project={tab} className="ml-auto @max-[13rem]:hidden" />
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Close ${tab.name}`}
                onClick={() => closeProject(id)}
                className="absolute right-1.5 size-5 rounded-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-3"
              >
                <XIcon />
              </Button>
            </div>
          )
        })}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New tab"
        title="New tab"
        disabled={openProjects.length >= PROJECTS.length}
        onClick={newProjectTab}
        className="shrink-0 self-center rounded-sm text-muted-foreground"
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
