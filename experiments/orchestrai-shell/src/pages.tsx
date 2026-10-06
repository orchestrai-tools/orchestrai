import type { ComponentType } from "react"
import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  HashIcon,
  InboxIcon,
  LayoutGridIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  ServerIcon,
  Settings2Icon,
  SquareCheckIcon,
  WorkflowIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import type { PageId } from "@/lib/window-store"
import { AgentsPage } from "@/pages/agents"
import { AutomationsPage } from "@/pages/automations"
import { BacklogPage } from "@/pages/backlog"
import { BoardPage } from "@/pages/board"
import { ChangesPage } from "@/pages/changes"
import { ChannelPage } from "@/pages/channel"
import { DocsPage } from "@/pages/docs"
import { GithubPage } from "@/pages/github"
import { InboxPage } from "@/pages/inbox"
import { MemoryPage } from "@/pages/memory"
import { ServicesPage } from "@/pages/services"
import { SessionsPage } from "@/pages/sessions"
import { SettingsPage } from "@/pages/settings"
import { TaskPage } from "@/pages/task"
import { WorkflowsPage } from "@/pages/workflows"

/** Sidebar groups, ordered by how often each is used, not alphabetically (NN/g). */
export type NavGroup = "work" | "knowledge" | "code" | "automation" | "runtime" | "footer" | "hidden"

export interface Page {
  id: PageId
  title: string
  icon: LucideIcon
  group: NavGroup
  /** Shown in the command palette next to the page. */
  shortcut?: string
  Component: ComponentType
}

export const PAGES: readonly Page[] = [
  { id: "board", title: "Board", icon: LayoutGridIcon, group: "work", shortcut: "G B", Component: BoardPage },
  { id: "inbox", title: "Inbox", icon: InboxIcon, group: "work", shortcut: "G I", Component: InboxPage },
  { id: "sessions", title: "Sessions", icon: MessagesSquareIcon, group: "work", shortcut: "G S", Component: SessionsPage },
  { id: "channel", title: "Channel", icon: HashIcon, group: "work", Component: ChannelPage },
  { id: "docs", title: "Docs", icon: BookOpenIcon, group: "knowledge", shortcut: "G D", Component: DocsPage },
  { id: "memory", title: "Memory", icon: BrainIcon, group: "knowledge", Component: MemoryPage },
  { id: "changes", title: "Changes", icon: GitCommitHorizontalIcon, group: "code", shortcut: "G C", Component: ChangesPage },
  { id: "github", title: "GitHub", icon: GitPullRequestIcon, group: "code", shortcut: "G P", Component: GithubPage },
  { id: "backlog", title: "Backlog", icon: ListTodoIcon, group: "code", Component: BacklogPage },
  { id: "workflows", title: "Workflows", icon: WorkflowIcon, group: "automation", Component: WorkflowsPage },
  { id: "automations", title: "Automations", icon: ZapIcon, group: "automation", Component: AutomationsPage },
  { id: "services", title: "Services", icon: ServerIcon, group: "runtime", Component: ServicesPage },
  { id: "agents", title: "Agents", icon: BotIcon, group: "footer", Component: AgentsPage },
  { id: "settings", title: "Project settings", icon: Settings2Icon, group: "footer", shortcut: "⌘,", Component: SettingsPage },
  { id: "task", title: "Task", icon: SquareCheckIcon, group: "hidden", Component: TaskPage },
]

export const NAV_GROUPS: readonly { id: NavGroup; label?: string }[] = [
  { id: "work" },
  { id: "knowledge", label: "Knowledge" },
  { id: "code", label: "Code" },
  { id: "automation", label: "Automation" },
  { id: "runtime", label: "Runtime" },
]

export function findPage(id: PageId): Page {
  return PAGES.find((page) => page.id === id) ?? PAGES[0]
}
