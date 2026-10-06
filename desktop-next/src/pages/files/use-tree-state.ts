import { loadProject, loadTask, setProjectFiles, setTaskFiles } from "@warpforge/core/sessionStore";
import { useEffect, useRef, useState } from "react";
import {
  closedFromExpanded,
  expandedFromClosed,
  readExpanded,
  savedExpanded,
  treeScrollToStore,
  type FileTreeNode,
} from "../../lib/file-tree";

/** One visible row of the file tree. */
export interface VisibleNode {
  node: FileTreeNode;
  depth: number;
  shown: boolean;
}

/** Folders that hold a change start open until the user closes them. */
export function isShown(node: FileTreeNode, closed: Readonly<Record<string, boolean>>): boolean {
  return node.path in closed ? !closed[node.path] : node.changed;
}

/** The rows on screen, depth first, skipping children of closed folders. */
export function visibleNodes(
  nodes: readonly FileTreeNode[],
  closed: Readonly<Record<string, boolean>>,
  depth = 0,
): VisibleNode[] {
  return nodes.flatMap((node) => {
    const shown = node.directory && isShown(node, closed);
    const row = { node, depth, shown };
    return shown ? [row, ...visibleNodes(node.children, closed, depth + 1)] : [row];
  });
}

/**
 * Open folders and scroll offset of the tree, saved per task (or per project
 * when no task is open) and restored when the tree comes back.
 */
export function useTreeState(
  nodes: FileTreeNode[],
  taskId: string,
  project: string,
  worktree: string | undefined,
) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const ready = useRef<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ top: number; left: number } | null>(null);
  const place = taskId || (project ? `project:${project}` : "");

  useEffect(() => {
    ready.current = null;
    if (!project || !place || nodes.length === 0) return;
    let cancel = false;
    const apply = (files: { expandedDirs: string[]; treeScrollTop: number; treeScrollLeft: number }) => {
      if (cancel) return;
      ready.current = place;
      pendingScroll.current = { top: files.treeScrollTop, left: files.treeScrollLeft };
      const expanded = readExpanded(files.expandedDirs);
      if (expanded) setClosed(closedFromExpanded(nodes, expanded));
    };
    if (taskId) void loadTask(taskId, project, worktree).then((session) => apply(session.files));
    else void loadProject(project).then((session) => apply(session.files));
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree, nodes, place]);

  useEffect(() => {
    if (!project || !place || ready.current !== place) return;
    const expandedDirs = savedExpanded(expandedFromClosed(nodes, closed));
    if (taskId) setTaskFiles(taskId, project, { expandedDirs }, worktree);
    else setProjectFiles(project, { expandedDirs });
  }, [closed, taskId, project, worktree, nodes, place]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const apply = () => {
      const saved = pendingScroll.current;
      if (!saved || ready.current !== place) return;
      // Wait until the restored folders are rendered tall enough to hold the offset.
      if (saved.top > element.scrollHeight - element.clientHeight + 1) return;
      element.scrollTop = saved.top;
      element.scrollLeft = saved.left;
      requestAnimationFrame(() => {
        if (pendingScroll.current === saved) pendingScroll.current = null;
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [place, closed]);

  function onScroll() {
    const element = list.current;
    if (!element || !project || !place || ready.current !== place || pendingScroll.current) return;
    const scroll = treeScrollToStore(
      element.scrollTop,
      element.scrollLeft,
      element.scrollHeight - element.clientHeight,
    );
    if (!scroll) return;
    if (taskId) setTaskFiles(taskId, project, scroll, worktree);
    else setProjectFiles(project, scroll);
  }

  const toggle = (path: string, shown: boolean) => setClosed((current) => ({ ...current, [path]: shown }));

  return { closed, toggle, list, onScroll };
}
