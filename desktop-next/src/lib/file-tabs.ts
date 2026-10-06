import {
  loadProject,
  loadTask,
  setProjectFiles,
  setProjectFind,
  setTaskFiles,
  setTaskFind,
} from "@warpforge/core/sessionStore";
import { useEffect, useRef } from "react";

/** The saved search, unless the box already has text. */
export function findToRestore(stored: string, current: string): string | null {
  if (current.trim() || !stored.trim()) return null;
  return stored;
}

/** The match to highlight for this search, clamped to the result list. */
export function findIndexToRestore(stored: number, count: number, sameQuery: boolean): number {
  if (!sameQuery || count <= 0) return 0;
  return Math.min(Math.max(stored, 0), count - 1);
}

/** Keep the previous match when the query has not changed. */
export function findIndexToSave(storedQuery: string, storedIndex: number, query: string): number {
  if (query.trim() && query.trim() === storedQuery.trim()) return storedIndex;
  return 0;
}

/** Open tabs to restore, unless the page already has some. */
export function tabsToRestore(
  stored: { tabs: string[]; activePath: string | null },
  currentPath: string | null,
  currentTabs: readonly string[],
): { path: string | null; tabs: string[] } | null {
  if (currentPath || currentTabs.length > 0) return null;
  if (stored.tabs.length === 0 && !stored.activePath) return null;
  const tabs =
    stored.activePath && !stored.tabs.includes(stored.activePath)
      ? [...stored.tabs, stored.activePath]
      : stored.tabs;
  return { path: stored.activePath, tabs };
}

/** Bring back the task's open files, and keep later opens in the same store. */
export function useFileTabs({
  taskId,
  project,
  worktree,
  path,
  tabs,
  setPath,
  setTabs,
}: {
  taskId: string | null;
  project: string | null;
  worktree?: string;
  path: string | null;
  tabs: string[];
  setPath: (path: string | null) => void;
  setTabs: (tabs: string[]) => void;
}) {
  const restored = useRef<string | null>(null);
  const pathRef = useRef(path);
  const tabsRef = useRef(tabs);
  pathRef.current = path;
  tabsRef.current = tabs;

  useEffect(() => {
    restored.current = null;
    if (!project) return;
    const place = taskId || `project:${project}`;
    let cancel = false;
    const apply = (files: { tabs: string[]; activePath: string | null }) => {
      if (cancel) return;
      restored.current = place;
      const next = tabsToRestore(files, pathRef.current, tabsRef.current);
      if (!next) return;
      setTabs(next.tabs);
      setPath(next.path);
    };
    if (taskId) void loadTask(taskId, project, worktree).then((session) => apply(session.files));
    else void loadProject(project).then((session) => apply(session.files));
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree, setPath, setTabs]);

  useEffect(() => {
    const place = taskId || (project ? `project:${project}` : "");
    if (!project || !place || restored.current !== place) return;
    const files = { activePath: path, tabs };
    if (taskId) setTaskFiles(taskId, project, files, worktree);
    else setProjectFiles(project, files);
  }, [taskId, project, worktree, path, tabs]);
}

/** Keep the find-in-files query with the task. */
export function useSavedFind(
  taskId: string | null,
  project: string | null,
  worktree: string | undefined,
  query: string,
  setQuery: (query: string) => void,
) {
  const ready = useRef<string | null>(null);
  const queryRef = useRef(query);
  const stored = useRef({ index: 0, query: "" });
  queryRef.current = query;

  useEffect(() => {
    ready.current = null;
    if (!project) return;
    let cancel = false;
    const apply = (find: { activeIndex?: number; query?: string } | null | undefined) => {
      if (cancel) return;
      ready.current = taskId || `project:${project}`;
      stored.current = {
        index: find?.activeIndex ?? 0,
        query: find?.query ?? "",
      };
      const next = findToRestore(stored.current.query, queryRef.current);
      if (next) setQuery(next);
    };
    if (taskId)
      void loadTask(taskId, project, worktree).then((session) => apply(session.findInFiles));
    else void loadProject(project).then((session) => apply(session.findInFiles));
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree, setQuery]);

  useEffect(() => {
    const key = taskId || (project ? `project:${project}` : "");
    if (!project || !key || ready.current !== key) return;
    const index = findIndexToSave(stored.current.query, stored.current.index, query);
    if (query.trim() !== stored.current.query.trim())
      stored.current = { index, query: query.trim() };
    const find = query.trim() ? { activeIndex: index, query, updatedAt: Date.now() } : null;
    if (taskId) setTaskFind(taskId, project, find, worktree);
    else setProjectFind(project, find);
  }, [taskId, project, worktree, query]);
}
