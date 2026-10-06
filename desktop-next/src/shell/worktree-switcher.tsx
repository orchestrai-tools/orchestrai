import { daemon } from "@warpforge/daemon";
import type { GitBranchList, WorktreeRow } from "@warpforge/protocol";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@warpforge/ui/components/sidebar";
import { ChevronsUpDownIcon, GitBranchIcon, GitMergeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMergeWorktree } from "../components/merge-worktree-dialog";
import { useChangesRefresh, useCheckoutChanged } from "../lib/shelf-palette";
import { fileTaskId, useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";

/** The project's worktrees, refreshed when the project or its task list changes. */
export function useWorktreeRows(project: string | null) {
  const taskCount = useDaemon().snapshot.tasks.length;
  const [rows, setRows] = useState<WorktreeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!project) return;
    let live = true;
    void daemon.listWorktreeRows(project).then(
      (next) => {
        if (!live) return;
        setRows(next);
        setError(null);
      },
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not list worktrees"),
    );
    return () => {
      live = false;
    };
  }, [project, reload, taskCount]);
  return { rows, error, retry: () => setReload((count) => count + 1) };
}

/** The checkout's current branch, read again when tasks or git actions may have moved it. */
function useCheckoutBranch(project: string | null) {
  const taskCount = useDaemon().snapshot.tasks.length;
  const changed = useChangesRefresh((state) => state.tick) + useCheckoutChanged((state) => state.tick);
  const [branch, setBranch] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    let live = true;
    void daemon.request("git.branches", { project }).then(
      (result) => live && setBranch((result as GitBranchList | null)?.current ?? null),
      () => live && setBranch(null),
    );
    return () => {
      live = false;
    };
  }, [project, taskCount, changed]);
  return branch;
}

/**
 * The project is already named in the title bar, so the sidebar header names
 * the next level down: the checkout or a task worktree. Changes, Files, and
 * the command bar follow it.
 */
export function WorktreeSwitcher() {
  const { isMobile } = useSidebar();
  const shell = useShell();
  const tasks = useDaemon().snapshot.tasks;
  const { rows, error, retry } = useWorktreeRows(shell.project);
  const checkoutBranch = useCheckoutBranch(shell.project);
  if (!shell.project) return null;

  const selected = fileTaskId(shell, tasks);
  const owned = rows.filter((row) => row.taskId);
  const current = owned.find((row) => row.taskId === selected);
  const task = tasks.find((item) => item.id === selected);
  const label = selected ? (current?.branch ?? task?.title ?? task?.prompt ?? "Task worktree") : (checkoutBranch ?? "Checkout");

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
                <span className="truncate text-sm font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {error ? "Could not list worktrees" : selected ? "Task worktree" : "Project checkout"}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Worktrees</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => shell.setFileContext(null)} className="gap-2 py-1.5">
              <GitBranchIcon />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{checkoutBranch ?? "Checkout"}</span>
                <span className="truncate text-xs text-muted-foreground">Project checkout</span>
              </span>
              {!selected && <span className="text-xs text-muted-foreground">Current</span>}
            </DropdownMenuItem>
            {owned.map((row) => (
              <DropdownMenuItem
                key={row.path}
                onClick={() => shell.setFileContext(row.taskId ?? null)}
                className="gap-2 py-1.5"
              >
                <GitBranchIcon />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{row.branch || row.taskTitle || row.path}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.taskTitle ?? row.path}</span>
                </span>
                {row.taskId === selected && <span className="text-xs text-muted-foreground">Current</span>}
              </DropdownMenuItem>
            ))}
            {error && <DropdownMenuItem onClick={retry}>Retry listing worktrees</DropdownMenuItem>}
            <DropdownMenuSeparator />
            {selected && (
              <DropdownMenuItem onClick={() => useMergeWorktree.getState().ask(selected)}>
                <GitMergeIcon />
                Merge this worktree…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                if (!shell.project) return;
                useShell.setState({ changesPane: { ...shell.changesPane, [shell.project]: "worktrees" } });
                shell.setPage("changes");
              }}
            >
              Manage worktrees…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
