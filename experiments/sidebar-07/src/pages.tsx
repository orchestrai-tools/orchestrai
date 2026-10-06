import type { ComponentType } from "react"
import {
  Columns3Icon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  PanelsTopLeftIcon,
  type LucideIcon,
} from "lucide-react"

import { ChatDemo } from "@/components/demos/chat-demo"
import { QuestionnaireDemo } from "@/components/demos/questionnaire-demo"
import { ResizableDemo } from "@/components/demos/resizable-demo"
import { SheetsDemo } from "@/components/demos/sheets-demo"
import { ProjectBadge, ProjectStatus } from "@/components/window/project-badge"
import { useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import type { PageId } from "@/lib/window-store"

/** The current project's overview, so switching projects visibly swaps the content. */
function DashboardPage() {
  const project = findProject(useAppSession((session) => session.project))
  const stats = [
    { label: "Agents running", value: project.running },
    { label: "Open pull requests", value: project.openPrs },
    { label: "Tasks", value: project.tasks },
  ]
  return (
    <>
      <div className="flex items-center gap-3">
        <ProjectBadge project={project} className="size-9 rounded-lg text-base" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{project.branch}</span>· updated {project.updated} ·
            <ProjectStatus project={project} />
          </p>
        </div>
      </div>
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex aspect-video flex-col justify-end rounded-xl bg-muted/50 p-4">
            <span className="text-3xl font-semibold tabular-nums">{stat.value}</span>
            <span className="text-sm text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="min-h-screen flex-1 rounded-xl bg-muted/50 md:min-h-min" />
    </>
  )
}

function ChatPage() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <ChatDemo />
      <QuestionnaireDemo />
    </div>
  )
}

export interface Page {
  id: PageId
  title: string
  /** First breadcrumb segment. */
  section: string
  icon: LucideIcon
  Component: ComponentType
}

export const PAGES: readonly Page[] = [
  { id: "dashboard", title: "Data Fetching", section: "Build Your Application", icon: LayoutDashboardIcon, Component: DashboardPage },
  { id: "chat", title: "Chat & Questions", section: "Demos", icon: MessagesSquareIcon, Component: ChatPage },
  { id: "resizable", title: "Resizable", section: "Demos", icon: Columns3Icon, Component: ResizableDemo },
  { id: "sheets", title: "Sheets", section: "Demos", icon: PanelsTopLeftIcon, Component: SheetsDemo },
]

export function findPage(id: PageId): Page {
  return PAGES.find((page) => page.id === id) ?? PAGES[0]
}
