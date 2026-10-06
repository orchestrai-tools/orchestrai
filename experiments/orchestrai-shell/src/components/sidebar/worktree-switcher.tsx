import { useMemo } from "react"
import { ChevronsUpDownIcon, GitBranchIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { worktreesFor, type Worktree } from "@/data/worktrees"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { selectSelection } from "@/lib/window-store"
import { useGitStore } from "@/pages/changes/git-store"

/** The project's worktrees, including ones created or removed on the Changes page. */
export function useProjectWorktrees(project: ProjectId): Worktree[] {
  const created = useGitStore((store) => store.created)
  const removed = useGitStore((store) => store.removed)
  return useMemo(
    () => [...worktreesFor(project), ...created.filter((entry) => entry.project === project)].filter((entry) => !removed.includes(entry.id)),
    [project, created, removed]
  )
}

/** The selected worktree; the command bar and new terminals run there. */
export function useCurrentWorktree(): Worktree {
  const project = useAppSession((session) => session.project)
  const selected = useAppSession((session) => selectSelection(session, "worktree"))
  const worktrees = useProjectWorktrees(project)
  return worktrees.find((worktree) => worktree.id === selected) ?? worktrees[0]
}

/**
 * The project is already named in the title bar, so the sidebar header names
 * the next level down: which worktree you are in. Each task has its own.
 */
export function WorktreeSwitcher() {
  const { isMobile } = useSidebar()
  const project = useAppSession((session) => session.project)
  const worktrees = useProjectWorktrees(project)
  const current = useCurrentWorktree()
  const { select } = useAppActions()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-md border bg-background">
                <GitBranchIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{current.branch}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {current.task ? "Task worktree" : "Project checkout"}
                  {current.dirty > 0 && ` · ${current.dirty} changed`}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-72"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Worktrees</DropdownMenuLabel>
            {worktrees.map((worktree) => (
              <DropdownMenuItem
                key={worktree.id}
                onClick={() => select("worktree", worktree.id)}
                className="gap-2 py-1.5"
              >
                <GitBranchIcon />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{worktree.branch}</span>
                  <span className="truncate text-xs text-muted-foreground">{worktree.path}</span>
                </span>
                {worktree.id === current.id && <span className="text-xs text-muted-foreground">Current</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => select("changes-view", "worktrees", "changes")}>
              Manage worktrees…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
