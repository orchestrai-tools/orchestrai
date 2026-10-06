import { daemon } from "@warpforge/daemon";
import type { ShelfList, StashList } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { targetKey, type RepoTarget } from "../../lib/repo-target";
import type { BundleMode } from "./use-changes";

/** A shelf entry or a stash entry, in the one shape the list shows. */
export interface Bundle {
  id: string;
  title: string;
  createdAt: number;
  branch?: string | null;
  files: string[];
  deletedFiles: string[];
}

/** The shelf or the stash for one checkout; `reload` after anything changes either. */
export function useBundles(target: RepoTarget | null, kind: BundleMode, tick: number) {
  const key = target ? targetKey(target) : "";
  const [entries, setEntries] = useState<Bundle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    if (!target) return;
    setLoading(true);
    const request =
      kind === "shelf"
        ? daemon.request("shelf.list", target).then((result) =>
            (result as ShelfList).entries.map((entry) => ({
              id: entry.id,
              title: entry.name,
              createdAt: entry.createdAt,
              branch: entry.branch,
              files: entry.files,
              deletedFiles: entry.deletedFiles ?? [],
            })),
          )
        : daemon.request("stash.list", target).then((result) =>
            (result as StashList).entries.map((entry) => ({
              id: entry.id,
              title: entry.message,
              createdAt: entry.createdAt,
              branch: entry.branch,
              files: entry.files,
              deletedFiles: [],
            })),
          );
    void request
      .then((next) => {
        setEntries(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the list"))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [key, kind, tick]);

  return { entries, error, loading, reload };
}

export type Bundles = ReturnType<typeof useBundles>;
