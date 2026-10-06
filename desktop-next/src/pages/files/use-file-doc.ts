import { daemon } from "@warpforge/daemon";
import type { FileDoc, SymbolMatch } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { jumpChangeIndex } from "../../lib/editor-session";
import { draftScope, useFileDrafts } from "../../lib/file-drafts";
import { useFileTabs } from "../../lib/file-tabs";
import { reportGitFailure } from "../../lib/git-result";
import { changedLineNumbers, changedLineText, revertChangedLine } from "../../lib/line-changes";
import { useShell } from "../../lib/shell-store";

export interface Jump {
  path: string;
  line: number;
  character: number;
}

/** A search or definition hit, 1-based, as a 0-based editor jump. */
export function jumpTo(match: SymbolMatch): Jump {
  return {
    path: match.path,
    line: Math.max(0, match.line - 1),
    character: Math.max(0, match.column - 1),
  };
}

/**
 * The open tabs, the file in hand with its unsaved draft, and the changed
 * line the change tools act on. Opening from elsewhere goes through
 * `shell.fileJump`.
 */
export function useFileDoc(project: string, taskId: string, worktree: string | undefined) {
  const [path, setPath] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [loadedDoc, setDoc] = useState<(FileDoc & { scope: string }) | null>(null);
  const [draft, updateDraft] = useState("");
  const [savedFile, setSaved] = useState<{ scope: string; path: string; text: string } | null>(
    null,
  );
  const [jump, setJump] = useState<Jump | null>(null);
  const [changeAt, setChangeAt] = useState(-1);
  const [committing, setCommitting] = useState(false);
  const fileJump = useShell((state) => state.fileJump);
  const scope = draftScope(project, taskId, worktree);
  const drafts = useFileDrafts((state) => state.scopes[scope]);
  const doc = loadedDoc?.path === path && loadedDoc.scope === scope ? loadedDoc : null;
  const saved = savedFile?.scope === scope && savedFile.path === path ? savedFile.text : null;
  useFileTabs({ taskId, project, worktree, path, tabs, setPath, setTabs });

  useEffect(() => {
    if (!fileJump) return;
    setTabs((current) => (current.includes(fileJump.path) ? current : [...current, fileJump.path]));
    setPath(fileJump.path);
    setJump({ path: fileJump.path, line: fileJump.line, character: 0 });
    setSaved(null);
    useShell.getState().setFileJump(null);
  }, [fileJump]);

  useEffect(() => {
    if (!path || !project) {
      setDoc(null);
      return;
    }
    let cancel = false;
    daemon
      .request("file.contents", { project, path, task_id: taskId })
      .then((result) => {
        if (cancel) return;
        const next = result as FileDoc;
        setDoc({ ...next, scope });
        updateDraft(useFileDrafts.getState().scopes[scope]?.[path]?.text ?? next.newText);
        setSaved(null);
        setChangeAt(-1);
      })
      .catch((err: unknown) => {
        if (!cancel) toast.error(err instanceof Error ? err.message : `Could not open ${path}`);
      });
    return () => {
      cancel = true;
    };
  }, [path, project, taskId, scope]);

  function setDraft(text: string) {
    updateDraft(text);
    if (path && doc) useFileDrafts.getState().edit(scope, path, text, saved ?? doc.newText);
  }

  const dirty = path ? Boolean(drafts?.[path]) : false;
  const changes = doc ? changedLineNumbers(doc.oldText, draft) : [];
  const changeLine = changes[changeAt];

  function open(next: string) {
    setTabs((current) => (current.includes(next) ? current : [...current, next]));
    setPath(next);
  }

  function closeWhere(gone: (tab: string) => boolean) {
    const rest = tabs.filter((item) => !gone(item));
    setTabs(rest);
    if (path && gone(path)) setPath(rest.at(-1) ?? null);
  }

  const close = (tab: string) => {
    useFileDrafts.getState().forget(scope, tab);
    closeWhere((item) => item === tab);
  };
  /** Close every tab at or under a deleted path. */
  const forget = (gone: string) => {
    useFileDrafts.getState().forget(scope, gone);
    closeWhere((item) => item === gone || item.startsWith(`${gone}/`));
  };

  function renamed(from: string, to: string) {
    useFileDrafts.getState().rename(scope, from, to);
    const move = (tab: string) =>
      tab === from ? to : tab.startsWith(`${from}/`) ? `${to}${tab.slice(from.length)}` : tab;
    setTabs((current) => [...new Set(current.map(move))]);
    if (path) setPath(move(path));
  }

  async function save(): Promise<boolean> {
    if (!path || !project || !doc) return false;
    try {
      await daemon.request("file.save", { project, path, content: draft, task_id: taskId });
      setSaved({ scope, path, text: draft });
      useFileDrafts.getState().saved(scope, path, draft);
      toast.success(`Saved ${path}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    }
  }

  function step(delta: number) {
    if (!path || changes.length === 0) return;
    const next = jumpChangeIndex(changeAt, delta, changes);
    setChangeAt(next);
    setJump({ path, line: changes[next] ?? 0, character: 0 });
  }

  function revertChange() {
    if (!doc || changeLine == null) return;
    setDraft(revertChangedLine(doc.oldText, draft, changeLine));
    setChangeAt(-1);
  }

  async function copyChange() {
    if (!doc || changeLine == null) return;
    try {
      await navigator.clipboard.writeText(changedLineText(doc.oldText, draft, changeLine));
      toast.success("Copied the change");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy the change");
    }
  }

  async function commit(message: string): Promise<boolean> {
    if (!doc || !path || !project || committing) return false;
    setCommitting(true);
    try {
      if (dirty) {
        await daemon.request("file.save", { project, path, content: draft, task_id: taskId });
        setSaved({ scope, path, text: draft });
        useFileDrafts.getState().saved(scope, path, draft);
      }
      await daemon.request("git.commit", { task_id: taskId, project, message, files: [path] });
      setDoc((current) =>
        current?.scope === scope && current.path === path
          ? { ...doc, oldText: draft, newText: draft }
          : current,
      );
      setChangeAt(-1);
      toast.success(`Committed ${path}`);
      return true;
    } catch (err) {
      reportGitFailure("Could not commit", err);
      return false;
    } finally {
      setCommitting(false);
    }
  }

  return {
    path,
    setPath,
    tabs,
    doc,
    draft,
    setDraft,
    saved,
    dirty,
    dirtyPaths: Object.keys(drafts ?? {}),
    jump,
    setJump,
    changes,
    changeAt,
    setChangeAt,
    committing,
    open,
    close,
    forget,
    renamed,
    save,
    step,
    revertChange,
    copyChange,
    revertAll: () => doc && setDraft(doc.oldText),
    commit,
  };
}
