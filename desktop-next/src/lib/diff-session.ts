import {
  loadTask,
  pruneTaskDiff,
  setTaskDiff,
  setTaskDiffHunkPosition,
} from "@warpforge/core/sessionStore";
import { useEffect, useRef } from "react";

/** Drop collapse and hunk records for files the diff no longer lists. */
export function usePruneDiff(
  taskId: string | null,
  project: string | null,
  worktree: string | undefined,
  paths: readonly string[] | null,
) {
  const listed = paths?.join("\0") ?? null;
  useEffect(() => {
    if (!taskId || !project || listed == null) return;
    let cancel = false;
    const known = new Set(listed === "" ? [] : listed.split("\0"));
    void loadTask(taskId, project, worktree).then(() => {
      if (cancel) return;
      pruneTaskDiff(taskId, known);
      // A sibling load can put the stored record back in the same turn.
      requestAnimationFrame(() => {
        if (!cancel) pruneTaskDiff(taskId, known);
      });
    });
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree, listed]);
}

/** Restore split view only while the page is still on the default unified view. */
export function diffViewToRestore(stored: string, current: "unified" | "split"): "split" | null {
  if (current !== "unified" || stored !== "split") return null;
  return "split";
}

/** The collapsed-file list after one file is opened or closed. */
export function collapsedAfterToggle(
  collapsed: readonly string[],
  path: string,
  open: boolean,
): string[] {
  if (open) return collapsed.filter((item) => item !== path);
  return collapsed.includes(path) ? [...collapsed] : [...collapsed, path];
}

/** Stable hunk identity, shared with the previous app. */
export function hunkKey(hunk: {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}): string {
  return `${hunk.oldStart}:${hunk.oldLines}:${hunk.newStart}:${hunk.newLines}`;
}

/** The hunk sitting at the top of the list, or the next one if none has reached it. */
export function hunkNearestTop(
  rows: readonly { file: string; key: string; top: number }[],
  edge: number,
): { file: string; key: string } | null {
  let best: { file: string; key: string; top: number } | null = null;
  for (const row of rows) {
    if (row.top <= edge + 8) {
      if (!best || row.top > best.top) best = row;
    } else if (!best) best = row;
  }
  return best ? { file: best.file, key: best.key } : null;
}

/** The saved offset once the page is tall enough to show it. */
export function diffScrollToApply(saved: number, room: number): number | null {
  if (saved > room + 1) return null;
  return saved;
}

/** A page with nothing to scroll must not replace a saved offset with zero. */
export function diffScrollToStore(top: number, room: number): number | null {
  if (room <= 1 && top === 0) return null;
  return top;
}

/** Keep unified or split with the task. */
export function useDiffView(
  taskId: string | null,
  project: string | null,
  worktree: string | undefined,
  view: "unified" | "split",
  setView: (view: "unified" | "split") => void,
) {
  const ready = useRef<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    ready.current = null;
    if (!taskId || !project) return;
    let cancel = false;
    void loadTask(taskId, project, worktree).then((session) => {
      if (cancel) return;
      ready.current = taskId;
      const next = diffViewToRestore(session.diff.view, viewRef.current);
      if (next) setView(next);
    });
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree, setView]);

  useEffect(() => {
    if (!taskId || !project || ready.current !== taskId) return;
    setTaskDiff(taskId, project, { view }, worktree);
  }, [taskId, project, worktree, view]);
}

/** Keep the Changes scroll position with the task. `root` is the scroller; without it, `main`. */
export function useDiffScroll(
  taskId: string | null,
  project: string | null,
  worktree: string | undefined,
  root?: HTMLElement | null,
) {
  const pending = useRef<{ top: number; file: string | null; key: string | null } | null>(null);

  useEffect(() => {
    pending.current = null;
    const main = root === undefined ? document.querySelector("main") : root;
    if (!taskId || !project || !main) return;
    let cancel = false;
    const apply = () => {
      const saved = pending.current;
      if (!saved) return;
      const hunk =
        saved.file && saved.key
          ? main.querySelector(
              `[data-file="${CSS.escape(saved.file)}"][data-hunk-key="${CSS.escape(saved.key)}"]`,
            )
          : null;
      const room = main.scrollHeight - main.clientHeight;
      const target =
        hunk instanceof HTMLElement
          ? main.scrollTop + hunk.getBoundingClientRect().top - main.getBoundingClientRect().top
          : saved.top;
      const next =
        hunk instanceof HTMLElement
          ? Math.min(Math.max(target, 0), Math.max(room, 0))
          : diffScrollToApply(target, room);
      if (next == null) return;
      main.scrollTop = next;
      if (!(hunk instanceof HTMLElement) && saved.key) return;
      requestAnimationFrame(() => {
        if (pending.current === saved) pending.current = null;
      });
    };
    void loadTask(taskId, project, worktree).then((session) => {
      if (cancel) return;
      const file = session.diff.selectedFile;
      pending.current = {
        file,
        key: file ? (session.diff.positions[file]?.hunkKey ?? null) : null,
        top: session.diff.scrollTop,
      };
      apply();
    });
    const observer = new ResizeObserver(apply);
    observer.observe(main);
    const page = main.querySelector(".page") ?? main.firstElementChild;
    if (page) observer.observe(page);
    const onScroll = () => {
      if (pending.current) return;
      const edge = main.getBoundingClientRect().top;
      const nearest = hunkNearestTop(
        [...main.querySelectorAll("[data-hunk-key]")].flatMap((node) => {
          if (!(node instanceof HTMLElement)) return [];
          const file = node.dataset.file ?? "";
          const key = node.dataset.hunkKey ?? "";
          if (!file || !key) return [];
          return [{ file, key, top: node.getBoundingClientRect().top }];
        }),
        edge,
      );
      const stored = diffScrollToStore(main.scrollTop, main.scrollHeight - main.clientHeight);
      if (stored != null || nearest) {
        setTaskDiff(
          taskId,
          project,
          {
            ...(stored == null ? {} : { scrollTop: stored }),
            ...(nearest ? { selectedFile: nearest.file } : {}),
          },
          worktree,
        );
      }
      if (nearest) setTaskDiffHunkPosition(taskId, project, nearest.file, nearest.key, worktree);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancel = true;
      observer.disconnect();
      main.removeEventListener("scroll", onScroll);
    };
  }, [taskId, project, worktree, root]);
}
