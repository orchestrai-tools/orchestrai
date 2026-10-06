import type { LucideIcon } from "lucide-react"
import {
  FocusIcon,
  FolderOpenIcon,
  HouseIcon,
  MoonIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  RowsIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from "lucide-react"

import { INBOX, inboxFor } from "@/data/inbox"
import { TASKS, tasksFor } from "@/data/tasks"
import { domainActions } from "@/lib/domain-actions"
import { findProject, PROJECTS, type ProjectId } from "@/lib/projects"
import type { PageId, SelectionKey } from "@/lib/window-store"
import { PAGES } from "@/pages"

export type ActionGroup =
  | "Suggested"
  | "Go to"
  | "Tasks"
  | "Sessions"
  | "Channel"
  | "Agents"
  | "Services"
  | "Projects"
  | "View"
  | "Settings"
  | "Danger zone"

/**
 * One action, defined once. The palette, keyboard shortcuts, menus, and an
 * agent's loopback MCP tools would all read this list, so nothing can be done
 * in one place that is impossible in another (DESIGN-PHILOSOPHY §4).
 */
export interface Action {
  id: string
  title: string
  group: ActionGroup
  icon?: LucideIcon
  shortcut?: string
  keywords?: string
  /** Dangerous actions confirm first, and an agent cannot skip that. */
  danger?: boolean
  run: (ctx: ActionContext) => void
}

export interface ActionContext {
  project: ProjectId
  setPage: (page: PageId) => void
  select: (key: SelectionKey, id: string, page?: PageId) => void
  /** Opens the task in its own project, leaving Home if needed. */
  openTask: (id: string) => void
  selectProject: (id: ProjectId) => void
  openHome: () => void
  /** The Inbox widened to every project. */
  openInboxAll: () => void
  openDialog: (dialog: "new-task" | "open-project") => void
  toggleSidebar: () => void
  toggleInspector: () => void
  toggleTerminal: () => void
  toggleFocus: () => void
  toggleTheme: () => void
  toggleDensity: () => void
  /** Project tabs or the project dropdown, for this window. */
  toggleProjectNav: () => void
}

/** Actions for the current project come first; the scope widens below them (Retool). */
export function buildActions(project: ProjectId): Action[] {
  const pending = inboxFor(project)
  const suggested: Action[] = [
    { id: "new-task", title: "New task", group: "Suggested", icon: PlusIcon, shortcut: "⌘N", run: (ctx) => ctx.openDialog("new-task") },
    ...(pending.length
      ? [{ id: "inbox", title: `Review ${pending.length} waiting in Inbox`, group: "Suggested" as const, shortcut: "G I", run: (ctx: ActionContext) => ctx.setPage("inbox") }]
      : []),
  ]
  const pages: Action[] = PAGES.filter((page) => page.group !== "hidden").map((page) => ({
    id: `page-${page.id}`,
    title: page.title,
    group: "Go to",
    icon: page.icon,
    shortcut: page.shortcut,
    run: (ctx) => ctx.setPage(page.id),
  }))
  const tasks: Action[] = tasksFor(project).map((task) => ({
    id: `task-${task.id}`,
    title: task.title,
    group: "Tasks",
    keywords: `${task.id} ${task.branch} ${task.status}`,
    run: (ctx) => ctx.openTask(task.id),
  }))
  const danger: Action[] = [
    { id: "discard", title: "Discard changes in this worktree…", group: "Danger zone", icon: Trash2Icon, danger: true, run: (ctx) => ctx.setPage("changes") },
  ]
  return [...suggested, ...pages, ...tasks, ...domainActions(project), ...projectActions(project), ...viewActions(true), ...danger]
}

/** On Home the scope is every project: what waits on you, any project, and any task. */
export function buildHomeActions(): Action[] {
  const suggested: Action[] = [
    { id: "new-task", title: "New task…", group: "Suggested", icon: PlusIcon, shortcut: "⌘N", run: (ctx) => ctx.openDialog("new-task") },
    ...(INBOX.length
      ? [{ id: "inbox-all", title: `Review ${INBOX.length} waiting across all projects`, group: "Suggested" as const, run: (ctx: ActionContext) => ctx.openInboxAll() }]
      : []),
  ]
  const tasks: Action[] = TASKS.map((task) => ({
    id: `task-${task.id}`,
    title: task.title,
    group: "Tasks",
    keywords: `${findProject(task.project).name} ${task.id} ${task.branch} ${task.status}`,
    run: (ctx) => ctx.openTask(task.id),
  }))
  return [...suggested, ...projectActions(), ...tasks, ...viewActions(false)]
}

/** Every project but the current one, Home when inside a project, and adding a project. */
function projectActions(current?: ProjectId): Action[] {
  return [
    ...(current ? [{ id: "home", title: "Go to Home", group: "Projects" as const, icon: HouseIcon, shortcut: "⌃1", run: (ctx: ActionContext) => ctx.openHome() }] : []),
    ...PROJECTS.filter((entry) => entry.id !== current).map((entry) => ({
      id: `project-${entry.id}`,
      title: current ? `Switch to ${entry.name}` : `Open ${entry.name}`,
      group: "Projects" as const,
      keywords: entry.repo,
      run: (ctx: ActionContext) => ctx.selectProject(entry.id),
    })),
    { id: "open-project", title: "Open project…", group: "Projects", icon: FolderOpenIcon, shortcut: "⌘O", run: (ctx) => ctx.openDialog("open-project") },
  ]
}

function viewActions(withTerminal: boolean): Action[] {
  return [
    { id: "focus", title: "Focus mode", group: "View", icon: FocusIcon, shortcut: "⇧⌘\\", keywords: "zen hide chrome", run: (ctx) => ctx.toggleFocus() },
    { id: "sidebar", title: "Toggle sidebar", group: "View", icon: PanelLeftIcon, shortcut: "⌘\\", run: (ctx) => ctx.toggleSidebar() },
    { id: "inspector", title: "Toggle inspector", group: "View", icon: PanelRightIcon, shortcut: "⌥⌘I", run: (ctx) => ctx.toggleInspector() },
    ...(withTerminal
      ? [{ id: "terminal", title: "Toggle terminal drawer", group: "View" as const, icon: SquareTerminalIcon, shortcut: "⌃`", run: (ctx: ActionContext) => ctx.toggleTerminal() }]
      : []),
    { id: "theme", title: "Switch light / dark", group: "View", icon: MoonIcon, run: (ctx) => ctx.toggleTheme() },
    { id: "density", title: "Switch comfortable / compact", group: "View", icon: RowsIcon, keywords: "density", run: (ctx) => ctx.toggleDensity() },
    { id: "project-nav", title: "Switch project tabs / dropdown", group: "View", icon: PanelsTopLeftIcon, keywords: "title bar switcher", run: (ctx) => ctx.toggleProjectNav() },
  ]
}

export const ACTION_GROUPS: readonly ActionGroup[] = [
  "Suggested",
  "Go to",
  "Tasks",
  "Sessions",
  "Channel",
  "Agents",
  "Services",
  "Projects",
  "View",
  "Settings",
  "Danger zone",
]
