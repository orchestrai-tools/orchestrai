import { loadTask, setTaskSurface, type SessionSurface } from "@warpforge/core/sessionStore";
import { useEffect, useRef } from "react";
import type { PageId } from "../model/pages";
import { currentPage, fileTaskId, useShell } from "./shell-store";
import { useDaemon } from "./use-daemon";

/** Files, Changes, and Services are the surfaces a task remembers. */
export function surfaceForPage(page: PageId): SessionSurface | null {
  if (page === "files") return "files";
  if (page === "changes") return "diff";
  if (page === "services") return "runtime";
  return null;
}

/** The page for a remembered surface. Terminal, browser, and pipeline stay put. */
export function pageForSurface(surface: SessionSurface): PageId | null {
  if (surface === "files") return "files";
  if (surface === "diff") return "changes";
  if (surface === "runtime") return "services";
  return null;
}

const REMEMBERED = new Set<PageId>(["files", "changes", "services"]);

/** Keep Files, Changes, or Services with the task, and return there when it is opened again. */
export function useTaskSurface() {
  const shell = useShell();
  const tasks = useDaemon().snapshot.tasks;
  const taskId = fileTaskId(shell, tasks);
  const project = shell.project;
  const page = currentPage(shell);
  const worktree = tasks.find((task) => task.id === taskId)?.worktree || undefined;
  const ready = useRef<string | null>(null);

  useEffect(() => {
    ready.current = null;
    if (!taskId || !project) return;
    let cancel = false;
    void loadTask(taskId, project, worktree).then((session) => {
      if (cancel) return;
      ready.current = taskId;
      const next = pageForSurface(session.activeSurface);
      const current = currentPage(useShell.getState());
      if (!next || next === current || !REMEMBERED.has(current)) return;
      useShell.getState().setPage(next);
    });
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree]);

  useEffect(() => {
    if (!taskId || !project || ready.current !== taskId) return;
    const surface = surfaceForPage(page);
    if (!surface) return;
    setTaskSurface(taskId, project, surface, worktree);
  }, [taskId, project, worktree, page]);
}
