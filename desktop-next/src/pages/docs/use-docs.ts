import { daemon } from "@warpforge/daemon";
import type { FileDoc } from "@warpforge/protocol";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";

import { useDocsRefresh } from "../../lib/docs-palette";
import { draftScope, useFileDrafts } from "../../lib/file-drafts";
import { useRequestGate } from "../../lib/request-gate";

export interface DocRow {
  path: string;
  title: string;
  updated?: number;
  snippet?: string;
}

export type DocMode = "read" | "split" | "edit";

/** How the page shows a doc, kept while the window is open so a reader who edits stays in the editor. */
export const useDocMode = create<{ mode: DocMode; setMode: (mode: DocMode) => void }>((set) => ({
  mode: "read",
  setMode: (mode) => set({ mode }),
}));

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The project's markdown index, reloaded when the palette asks. */
export function useDocList(project: string) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tick = useDocsRefresh((state) => state.tick);
  const gate = useRequestGate(project);

  const reload = useCallback(() => {
    const current = gate.begin();
    setLoading(true);
    return daemon
      .request("docs.list", { project })
      .then((result) => {
        if (!current()) return null;
        const rows = (result as { docs?: DocRow[] }).docs ?? [];
        setDocs(rows);
        setError(null);
        return rows;
      })
      .catch((err: unknown) => {
        if (current()) setError(message(err, "Could not list docs"));
        return null;
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
  }, [project, gate]);

  useEffect(() => {
    void reload();
  }, [reload, tick]);

  return { docs, loading, error, reload };
}

/** One doc's saved text and the draft being edited. A path with no file yet opens empty, ready to be written. */
export function useDocFile(project: string, path: string) {
  const scope = draftScope(project, "");
  const key = JSON.stringify([project, path]);
  const [loaded, setLoaded] = useState<{ key: string; text: string; error: string | null } | null>(
    null,
  );
  const saved = loaded?.key === key ? loaded.text : null;
  const error = loaded?.key === key ? loaded.error : null;
  const stored = useFileDrafts((state) => state.scopes[scope]?.[path]);
  const draft = stored?.text ?? saved ?? "";
  const [tick, setTick] = useState(0);
  const gate = useRequestGate(key);

  useEffect(() => {
    if (!path) return;
    const current = gate.begin();
    setLoaded(null);
    void daemon
      .request("file.contents", { project, path, task_id: "" })
      .then((result) => {
        if (!current()) return;
        const text = (result as FileDoc).newText ?? "";
        setLoaded({ key, text, error: null });
      })
      .catch((err: unknown) => {
        if (!current()) return;
        setLoaded({ key, text: "", error: message(err, "Could not open the doc") });
      });
  }, [project, path, key, gate, tick]);

  const write = useCallback(
    async (target: string, content: string) => {
      if (saved === null || error)
        throw new Error(error ?? "Wait for the document to load before saving");
      await daemon.request("docs.write", { project, path: target, content });
      if (target === path) {
        setLoaded((current) => (current?.key === key ? { ...current, text: content } : current));
        useFileDrafts.getState().saved(scope, path, content);
      }
    },
    [project, path, saved, error, key, scope],
  );

  return {
    saved,
    draft,
    setDraft: (text: string) => useFileDrafts.getState().edit(scope, path, text, saved ?? ""),
    error,
    loading: saved === null,
    dirty: saved !== null && draft !== saved,
    reload: () => setTick((count) => count + 1),
    write,
  };
}
