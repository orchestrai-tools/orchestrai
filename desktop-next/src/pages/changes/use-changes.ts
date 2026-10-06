import { daemon } from "@warpforge/daemon";
import type { GitRoots, TaskDiff } from "@warpforge/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { carryChecks } from "../../lib/carry-checks";
import { useDiffView, usePruneDiff } from "../../lib/diff-session";
import { useFolderStage } from "../../lib/folder-palette";
import { useAsideAsk, useChangesRefresh, useDiffLayout } from "../../lib/shelf-palette";
import { useDaemon } from "../../lib/use-daemon";
import { changedFile, type ChangedFile } from "./tree";

export type DiffMode = "unified" | "split";
export type BundleMode = "shelf" | "stash";
export type BundleRequest = { mode: BundleMode; paths: string[]; name: string };

/**
 * One working tree's diff and what the next commit takes: the task's, or the
 * project checkout's when no task is open. The palette reaches in through its
 * ask stores; each ask is applied here and cleared.
 */
export function useChanges(taskId: string, project: string | null, worktree: string | undefined) {
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [roots, setRoots] = useState<GitRoots["roots"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const [mode, setMode] = useState<DiffMode>("unified");
  const [flat, setFlat] = useState(false);
  const [bundle, setBundle] = useState<BundleRequest | null>(null);
  const [rollbackAsked, setRollbackAsked] = useState(false);
  useDiffView(taskId || null, project, worktree, mode, setMode);
  usePruneDiff(
    taskId || null,
    project,
    worktree,
    diff ? diff.files.map((file) => file.path) : null,
  );

  const subject = taskId ? { task_id: taskId } : project ? { project } : null;

  const shownPaths = useRef<string[] | null>(null);

  /** `quiet` re-reads in the background: no spinner, and the user's unchecks survive. */
  function reload(quiet = false) {
    if (!subject) return;
    if (!quiet) setLoading(true);
    daemon
      .request("diff.get", subject)
      .then((result) => {
        const next = result as TaskDiff;
        const paths = next.files.map((file) => file.path);
        const previous = quiet ? shownPaths.current : null;
        shownPaths.current = paths;
        setDiff(next);
        setChecked((current) => carryChecks(previous, current, paths));
        setError(null);
      })
      .catch((err: unknown) => {
        if (!quiet) setError(err instanceof Error ? err.message : "Could not load the diff");
      })
      .finally(() => {
        if (!quiet) setLoading(false);
      });
  }

  const taskUpdatedAt = useDaemon().snapshot.tasks.find((task) => task.id === taskId)?.updatedAt;
  useEffect(() => {
    if (taskUpdatedAt !== undefined) reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskUpdatedAt]);

  useEffect(() => {
    const onFocus = () => reload(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, project]);

  const tick = useChangesRefresh((state) => state.tick);
  useEffect(() => {
    setDiff(null);
    reload();
    if (!subject) {
      setRoots([]);
      return;
    }
    void daemon
      .request("git.roots", subject)
      .then((result) => setRoots((result as GitRoots).roots ?? []))
      .catch(() => setRoots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, project, tick]);

  const files = useMemo<ChangedFile[]>(() => {
    if (!diff) return [];
    const untracked = new Set(diff.untrackedPaths ?? []);
    const shown =
      diff.untrackedAvailable === false
        ? diff.files.filter((file) => !untracked.has(file.path))
        : diff.files;
    return shown.map((file) => changedFile(file, untracked.has(file.path)));
  }, [diff]);

  function check(paths: string[], on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      for (const path of paths) {
        if (on) next.add(path);
        else next.delete(path);
      }
      return [...next];
    });
  }

  const layout = useDiffLayout();
  useEffect(() => {
    const store = useDiffLayout.getState();
    if (layout.view) {
      setMode(layout.view);
      store.clearView();
    }
    if (layout.flat != null) {
      setFlat(layout.flat);
      store.clearFlat();
    }
    if (layout.stage && diff) {
      setChecked(layout.stage === "all" ? diff.files.map((file) => file.path) : []);
      store.clearStage();
    }
    if (layout.stageFile && diff) {
      check([layout.stageFile.path], layout.stageFile.on);
      store.clearStageFile();
    }
    if (layout.armRollback) {
      if (checked.length === 0) toast.error("Check a file first");
      else setRollbackAsked(true);
      store.clearArm();
    }
  }, [layout, diff, checked.length]);

  const folderStage = useFolderStage((state) => state.pending);
  useEffect(() => {
    if (!folderStage) return;
    check(folderStage.paths, folderStage.on);
    useFolderStage.getState().clear();
  }, [folderStage]);

  const asideAsk = useAsideAsk((state) => state.pending);
  useEffect(() => {
    if (!asideAsk) return;
    useAsideAsk.getState().clear();
    askBundle(asideAsk.kind, asideAsk.paths);
  }, [asideAsk]);

  function askBundle(mode: BundleMode, paths: string[], name = "") {
    if (paths.length === 0) {
      toast.error("Check a file first");
      return;
    }
    setBundle({ mode, paths, name });
  }

  async function commit(message: string, amend: boolean) {
    const all = diff != null && checked.length === diff.files.length;
    await daemon.request("git.commit", { files: all ? null : checked, message, amend, ...subject });
    toast.success(amend ? "Amended" : "Committed");
    reload();
  }

  return {
    diff,
    files,
    roots,
    error,
    loading,
    reload: () => reload(),
    checked,
    setChecked,
    check,
    mode,
    setMode,
    flat,
    setFlat,
    bundle,
    askBundle,
    closeBundle: () => setBundle(null),
    rollbackAsked,
    clearRollback: () => setRollbackAsked(false),
    commit,
  };
}

export type Changes = ReturnType<typeof useChanges>;
