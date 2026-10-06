import { daemon } from "@warpforge/daemon";
import type { FileDoc } from "@warpforge/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useDocsRefresh } from "../../lib/docs-palette";

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

  const reload = useCallback(() => {
    setLoading(true);
    return daemon
      .request("docs.list", { project })
      .then((result) => {
        const rows = (result as { docs?: DocRow[] }).docs ?? [];
        setDocs(rows);
        setError(null);
        return rows;
      })
      .catch((err: unknown) => {
        setError(message(err, "Could not list docs"));
        return null;
      })
      .finally(() => setLoading(false));
  }, [project]);

  useEffect(() => {
    void reload();
  }, [reload, tick]);

  return { docs, loading, error, reload };
}

/** One doc's saved text and the draft being edited. A path with no file yet opens empty, ready to be written. */
export function useDocFile(project: string, path: string) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (!path) return;
    const run = ++generation.current;
    setSaved(null);
    setError(null);
    void daemon
      .request("file.contents", { project, path, task_id: "" })
      .then((result) => {
        if (run !== generation.current) return;
        const text = (result as FileDoc).newText ?? "";
        setSaved(text);
        setDraft(text);
      })
      .catch((err: unknown) => {
        if (run !== generation.current) return;
        setSaved("");
        setDraft("");
        setError(message(err, "Could not open the doc"));
      });
  }, [project, path, tick]);

  const write = useCallback(
    async (target: string, content: string) => {
      await daemon.request("docs.write", { project, path: target, content });
      if (target === path) setSaved(content);
    },
    [project, path],
  );

  return {
    saved,
    draft,
    setDraft,
    error,
    loading: saved === null,
    dirty: saved !== null && draft !== saved,
    reload: () => setTick((count) => count + 1),
    write,
  };
}
