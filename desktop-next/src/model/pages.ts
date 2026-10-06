import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  FolderTreeIcon,
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
} from "lucide-react";

export type PageId =
  | "board"
  | "inbox"
  | "changes"
  | "files"
  | "github"
  | "backlog"
  | "workflows"
  | "automations"
  | "memory"
  | "docs"
  | "sessions"
  | "channel"
  | "services"
  | "agents"
  | "settings"
  | "task";

/** Sidebar groups, ordered by how often each is used, not alphabetically. */
export type NavGroup = "work" | "knowledge" | "code" | "automation" | "runtime" | "footer" | "hidden";

export interface PageDef {
  id: PageId;
  title: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Second key of the G-then-letter shortcut. */
  key?: string;
}

export const PAGES: PageDef[] = [
  { id: "board", title: "Board", icon: LayoutGridIcon, group: "work", key: "b" },
  { id: "inbox", title: "Inbox", icon: InboxIcon, group: "work", key: "i" },
  { id: "sessions", title: "Sessions", icon: MessagesSquareIcon, group: "work", key: "s" },
  { id: "channel", title: "Channel", icon: HashIcon, group: "work", key: "h" },
  { id: "docs", title: "Docs", icon: BookOpenIcon, group: "knowledge", key: "d" },
  { id: "memory", title: "Memory", icon: BrainIcon, group: "knowledge", key: "m" },
  { id: "changes", title: "Changes", icon: GitCommitHorizontalIcon, group: "code", key: "c" },
  { id: "files", title: "Files", icon: FolderTreeIcon, group: "code", key: "f" },
  { id: "github", title: "GitHub", icon: GitPullRequestIcon, group: "code", key: "p" },
  { id: "backlog", title: "Backlog", icon: ListTodoIcon, group: "code", key: "l" },
  { id: "workflows", title: "Workflows", icon: WorkflowIcon, group: "automation", key: "w" },
  { id: "automations", title: "Automations", icon: ZapIcon, group: "automation", key: "a" },
  { id: "services", title: "Services", icon: ServerIcon, group: "runtime", key: "r" },
  { id: "agents", title: "Agents", icon: BotIcon, group: "footer", key: "e" },
  { id: "settings", title: "Settings", icon: Settings2Icon, group: "footer", key: "," },
  { id: "task", title: "Task", icon: SquareCheckIcon, group: "hidden" },
];

export const NAV_GROUPS: readonly { id: NavGroup; label?: string }[] = [
  { id: "work" },
  { id: "knowledge", label: "Knowledge" },
  { id: "code", label: "Code" },
  { id: "automation", label: "Automation" },
  { id: "runtime", label: "Runtime" },
];

/** Pages shown in the sidebar, in order. Task is opened from a card, not the nav. */
export const NAV_PAGES = PAGES.filter((page) => page.group !== "hidden");

/** The page opened by G then this letter, when the letter is assigned. */
export function pageForGoKey(key: string): PageId | null {
  const page = NAV_PAGES.find((item) => item.key === key.toLowerCase());
  return page?.id ?? null;
}

export function findPage(id: PageId): PageDef {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}

export function pageTitle(id: PageId): string {
  return findPage(id).title;
}

/** The G-then-letter hint shown beside a page, as the palette and menus print it. */
export function pageShortcut(page: PageDef): string | undefined {
  if (!page.key) return undefined;
  return page.key === "," ? "⌘," : `G ${page.key.toUpperCase()}`;
}
