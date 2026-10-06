import type { ComponentType, ReactNode } from "react"
import {
  BookMarkedIcon,
  FileDiffIcon,
  InfoIcon,
  ListChecksIcon,
  ReceiptTextIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"

import { StatusMark } from "@/components/common/status-mark"
import { LibraryDetails, type LibraryPage } from "@/components/inspector/library-details"
import { PullDetails } from "@/components/inspector/pull-details"
import { RuntimeDetails } from "@/components/inspector/runtime-details"
import { useProjectWorktrees } from "@/components/sidebar/worktree-switcher"
import { Button } from "@/components/ui/button"
import { findAgent } from "@/data/agents"
import { inboxFor } from "@/data/inbox"
import type { AgentSession } from "@/data/sessions"
import { taskDetail } from "@/data/task-detail"
import { tasksFor } from "@/data/tasks"
import { worktreesFor } from "@/data/worktrees"
import { useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { selectPage, selectSelection, type InspectorId } from "@/lib/window-store"
import { ORIGIN_LABEL, usageText } from "@/pages/sessions/session-meta"
import { SessionStatusMark } from "@/pages/sessions/session-status"
import { useSessionsStore } from "@/pages/sessions/sessions-store"

const LIBRARY_KEY: Partial<Record<LibraryPage, "workflow" | "automation" | "memory">> = {
  workflows: "workflow",
  automations: "automation",
  memory: "memory",
}

/** The inspector describes what is selected: the open task or session, or else the project. */
function useSubject() {
  const project = useAppSession((session) => session.project)
  const page = useAppSession(selectPage)
  const taskId = useAppSession((session) => selectSelection(session, "task"))
  const sessionId = useAppSession((session) => selectSelection(session, "session"))
  const agentSession = useSessionsStore((state) =>
    page === "sessions" ? state.sessions.find((entry) => entry.id === sessionId && entry.project === project) : undefined
  )
  // On Changes the inspector follows the worktree in hand, so its task's checks and context show beside the diff.
  const worktrees = useProjectWorktrees(project)
  const worktreeId = useAppSession((session) => selectSelection(session, "worktree"))
  const worktreeTask = page === "changes" ? (worktrees.find((entry) => entry.id === worktreeId) ?? worktrees[0])?.task : undefined
  const detail =
    page === "task" || page === "board"
      ? taskDetail(taskId)
      : agentSession?.task
        ? taskDetail(agentSession.task)
        : worktreeTask
          ? taskDetail(worktreeTask)
          : undefined
  const serviceKey = useAppSession((session) =>
    page === "services" ? (selectSelection(session, "service") ?? "first") : undefined
  )
  const library = LIBRARY_KEY[page as LibraryPage]
  const librarySelection = useAppSession((session) => (library ? selectSelection(session, library) : undefined))
  return {
    project: findProject(project),
    detail,
    agentSession,
    serviceKey,
    library: library ? { page: page as LibraryPage, selection: librarySelection } : undefined,
    github: page === "github",
  }
}

function SessionDetails({ session }: { session: AgentSession }) {
  const agent = findAgent(session.agent)
  return (
    <dl className="px-4 py-2">
      <Row label="Status"><SessionStatusMark status={session.status} /></Row>
      <Row label="Agent">{agent.name} · {session.model}</Row>
      {session.account && <Row label="Account">{session.account}</Row>}
      <Row label="Started">{ORIGIN_LABEL[session.origin]}</Row>
      <Row label="Source">{session.source}</Row>
      <Row label="Turns">{session.turns ?? "Not kept by this agent"}</Row>
      {session.context && <Row label="Context">{usageText(session)}</Row>}
      <Row label="Continue">{agent.canContinue ? "session/load" : "Not advertised"}</Row>
      <Row label="Fork">{agent.canFork ? "session/fork" : "Not advertised"}</Row>
      {session.forkedFrom && <Row label="Forked from"><span className="font-mono">{session.forkedFrom}</span></Row>}
      {session.task && <Row label="Task">{session.task}</Row>}
      <Row label="Session id"><span className="font-mono">{session.id}</span></Row>
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-4 text-xs text-muted-foreground">{children}</p>
}

function DetailsPanel() {
  const { project, detail, agentSession, serviceKey, library, github } = useSubject()
  if (agentSession) return <SessionDetails session={agentSession} />
  if (serviceKey) return <RuntimeDetails project={project.id} selection={serviceKey} />
  if (library) return <LibraryDetails project={project.id} page={library.page} selection={library.selection} />
  if (github) return <PullDetails project={project.id} />
  if (!detail) {
    const tasks = tasksFor(project.id)
    return (
      <dl className="px-4 py-2">
        <Row label="Repository">{project.repo}</Row>
        <Row label="Path">{project.path}</Row>
        <Row label="Default branch">{project.branch}</Row>
        <Row label="Running">{tasks.filter((task) => task.status === "running").length} tasks</Row>
        <Row label="Needs you">{inboxFor(project.id).length} items</Row>
        <Row label="Worktrees">{worktreesFor(project.id).length}</Row>
      </dl>
    )
  }
  const { task } = detail
  const agent = findAgent(task.agent)
  return (
    <dl className="px-4 py-2">
      <Row label="Status"><StatusMark status={task.status} /></Row>
      <Row label="Agent">{agent.name} · {agent.model}</Row>
      <Row label="Workflow">{task.workflow}</Row>
      <Row label="Stage">{task.stage}</Row>
      <Row label="Stops at">{task.stopPoints.join(", ")}</Row>
      <Row label="Autonomy">{task.autonomy}</Row>
      <Row label="Permissions">{agent.permissionProfile}</Row>
      <Row label="Branch"><span className="font-mono">{task.branch}</span></Row>
      <Row label="Worktree"><span className="font-mono">{task.worktree}</span></Row>
      <Row label="Elapsed">{task.elapsed}</Row>
      {task.pr && <Row label="Pull request">#{task.pr.number} · {task.pr.state} · checks {task.pr.checks}</Row>}
    </dl>
  )
}

function ChangesPanel() {
  const { project, detail } = useSubject()
  if (!detail) {
    return (
      <ul className="px-2 py-2">
        {worktreesFor(project.id).map((worktree) => (
          <li key={worktree.id} className="flex items-center gap-2 rounded-sm px-2 py-(--row-py) text-xs hover:bg-sidebar-accent">
            <span className="truncate font-mono">{worktree.branch}</span>
            <span className="ml-auto text-muted-foreground">{worktree.dirty ? `${worktree.dirty} changed` : "clean"}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (!detail.files.length) return <Empty>{detail.task.changes.files} files changed. Open Changes to see the diff.</Empty>
  return (
    <ul className="px-2 py-2">
      {detail.files.map((file) => (
        <li key={file.path} className="flex items-center gap-2 rounded-sm px-2 py-(--row-py) text-xs hover:bg-sidebar-accent">
          <span className="w-3 shrink-0 font-mono text-muted-foreground">{file.status}</span>
          <span className="min-w-0 truncate font-mono" title={file.path}>{file.path.split("/").at(-1)}</span>
          <span className="ml-auto shrink-0 tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{" "}
            <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

const CHECK_TONE = { passing: "text-emerald-600 dark:text-emerald-400", failing: "text-red-600 dark:text-red-400", pending: "text-muted-foreground" }

function ChecksPanel() {
  const { detail } = useSubject()
  if (!detail) return <Empty>Open a task to see its checks. Main is green.</Empty>
  return (
    <div className="px-4 py-2">
      {detail.task.attempts && (
        <p className="pb-2 text-xs text-muted-foreground">
          Fix attempt {detail.task.attempts.used} of {detail.task.attempts.cap}. It stops and asks at the cap.
        </p>
      )}
      <ul>
        {detail.checks.map((check) => (
          <li key={check.name} className="flex items-center gap-2 py-(--row-py) text-xs">
            <span className={cn("w-14 shrink-0", CHECK_TONE[check.status])}>{check.status}</span>
            <span className="min-w-0 truncate font-mono">{check.name}</span>
            <span className="ml-auto text-muted-foreground">{check.duration}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContextPanel() {
  const { detail } = useSubject()
  if (!detail) return <Empty>Open a task to see exactly which instructions, skills, and memory it received.</Empty>
  return (
    <ul className="px-4 py-2">
      {detail.context.map((entry) => (
        <li key={entry.path} className={cn("py-(--row-py) text-xs", !entry.used && "text-muted-foreground line-through")}>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground no-underline">{entry.kind}</span>
            <span className="truncate font-mono">{entry.path}</span>
          </div>
          {entry.note && <p className="pl-22 text-[11px] text-muted-foreground">{entry.note}</p>}
        </li>
      ))}
    </ul>
  )
}

function ActivityPanel() {
  const { detail } = useSubject()
  const receipts = (detail ?? taskDetail("orc-03"))?.receipts ?? []
  return (
    <ol className="px-2 py-2">
      {receipts.map((receipt, index) => (
        <li key={index} className="group/receipt flex gap-2 rounded-sm px-2 py-(--row-py) text-xs hover:bg-sidebar-accent">
          <span className="w-9 shrink-0 text-muted-foreground tabular-nums">{receipt.time}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{receipt.action} {receipt.target}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{receipt.permission}</span>
          </span>
          {receipt.undo && (
            <Button variant="ghost" size="icon-xs" aria-label={`Undo: ${receipt.action} ${receipt.target}`} className="opacity-0 group-hover/receipt:opacity-100 focus-visible:opacity-100">
              <Undo2Icon />
            </Button>
          )}
        </li>
      ))}
    </ol>
  )
}

export interface InspectorPanel {
  id: InspectorId
  title: string
  icon: LucideIcon
  Content: ComponentType
}

export const INSPECTOR_PANELS: readonly InspectorPanel[] = [
  { id: "details", title: "Details", icon: InfoIcon, Content: DetailsPanel },
  { id: "changes", title: "Changes", icon: FileDiffIcon, Content: ChangesPanel },
  { id: "checks", title: "Checks", icon: ListChecksIcon, Content: ChecksPanel },
  { id: "context", title: "Context", icon: BookMarkedIcon, Content: ContextPanel },
  { id: "activity", title: "Receipts", icon: ReceiptTextIcon, Content: ActivityPanel },
]
