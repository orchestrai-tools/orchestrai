import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { HouseIcon, PlusIcon, XIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import { ProjectBadge, ProjectStatus } from "@/components/window/project-badge"
import { INBOX } from "@/data/inbox"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { findProject, type ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
const HOME = "home"
type TabKey = ProjectId | typeof HOME

function Tab({
  tabKey,
  active,
  divider,
  onSelect,
  onClose,
  className,
  children,
}: {
  tabKey: TabKey
  active: boolean
  divider: boolean
  onSelect: () => void
  onClose?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "group/tab relative flex shrink items-center text-[12px]",
        // The active tab takes the content's colour and covers the bar's bottom border, so it joins the page below.
        active ? "z-10 -mb-px bg-background" : "hover:bg-foreground/5",
        divider && "before:absolute before:left-0 before:h-4 before:w-px before:bg-foreground/15 group-hover/tab:before:opacity-0",
        className
      )}
    >
      <button
        type="button"
        role="tab"
        data-tab={tabKey}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={onSelect}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          onClose ? "pr-8" : "pr-3",
          active ? "text-foreground" : "text-foreground/70"
        )}
      >
        {children}
      </button>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close tab"
          onClick={onClose}
          className="absolute right-1.5 size-5 rounded-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-3"
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}

/**
 * TradingView-style tabs in the title bar: a pinned Home tab, then one tab
 * per open project. Tabs span the bar's height; the active one is filled with
 * the content's colour so it reads as part of the page, and inactive
 * neighbours are split by a hairline. Arrow keys move between tabs.
 */
export function ProjectTabs() {
  const { openProjects, project, home } = useAppSession(
    useShallow((session) => ({ openProjects: session.openProjects, project: session.project, home: session.home }))
  )
  const { selectProject, closeProject, openHome } = useAppActions()
  const dialog = useDialog()
  const list = useRef<HTMLDivElement>(null)
  const keys: TabKey[] = [HOME, ...openProjects]
  const activeKey: TabKey = home ? HOME : project

  const activate = (key: TabKey) => {
    if (key === HOME) openHome()
    else selectProject(key)
    list.current?.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const index = keys.indexOf(activeKey)
    const target =
      event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : index + (ARROW_STEP[event.key] ?? NaN)
    if (Number.isNaN(target)) return
    event.preventDefault()
    activate(keys[(target + keys.length) % keys.length])
  }

  return (
    <div className="flex min-w-0 items-stretch gap-1">
      <div ref={list} role="tablist" aria-label="Projects" onKeyDown={onKeyDown} className="flex min-w-0 items-stretch">
        <Tab tabKey={HOME} active={home} divider={false} onSelect={openHome} className="shrink-0">
          <HouseIcon className="size-3.5" />
          <span className={cn(home && "font-medium")}>Home</span>
          {INBOX.length > 0 && (
            <span className="flex items-center gap-1 text-amber-600 tabular-nums dark:text-amber-400" title={`${INBOX.length} need you across all projects`}>
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {INBOX.length}
            </span>
          )}
        </Tab>
        {openProjects.map((id, index) => {
          const tab = findProject(id)
          const active = !home && id === project
          const before = keys[index]
          return (
            <Tab
              key={id}
              tabKey={id}
              active={active}
              divider={!active && before !== activeKey}
              onSelect={() => selectProject(id)}
              onClose={() => closeProject(id)}
              className="@container w-56 min-w-24"
            >
              <ProjectBadge project={tab} />
              <span className={cn("truncate", active && "font-medium")}>{tab.name}</span>
              <ProjectStatus project={tab} className="ml-auto @max-[13rem]:hidden" />
            </Tab>
          )
        })}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Open project"
        title="Open project (⌘O)"
        onClick={() => dialog.open("open-project")}
        className="shrink-0 self-center rounded-sm text-muted-foreground"
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
