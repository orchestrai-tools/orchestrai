import { daemon } from "@warpforge/daemon";
import type { GitIgnoredFiles } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { FolderIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { targetKey, type RepoTarget } from "../../lib/repo-target";
import { useShell } from "../../lib/shell-store";
import { RowSkeletons } from "./row-skeletons";
import { plural } from "./tree";

type Listing = { paths: string[]; truncated: boolean; unavailable: boolean };

/** Ignored paths are listed, never checked: a commit cannot take them. Whole ignored folders are one row. */
export function IgnoredList({ target }: { target: RepoTarget }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setListing(null);
    setError(null);
    void daemon
      .request("git.ignored", target)
      .then((result) => {
        const list = result as GitIgnoredFiles;
        setListing({
          paths: list.available === false ? [] : (list.ignored ?? []),
          truncated: Boolean(list.truncated),
          unavailable: list.available === false,
        });
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not list ignored files"),
      );
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [targetKey(target)]);

  const paths = listing?.paths ?? [];
  const folders = paths.filter((path) => path.endsWith("/")).length;
  return (
    <div className="mt-2 border-t pt-2">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        Ignored
        {listing &&
          !listing.unavailable &&
          ` · ${plural(folders, "folder")}, ${plural(paths.length - folders, "file")}`}
      </p>
      {error && (
        <p className="flex items-center gap-2 px-2 text-xs text-red-600 dark:text-red-400">
          {error}
          <Button variant="link" size="xs" onClick={load}>
            Retry
          </Button>
        </p>
      )}
      {!listing && !error && (
        <RowSkeletons label="Loading ignored files" rows={2} className="px-2" />
      )}
      {listing?.unavailable && (
        <p className="px-2 text-xs text-muted-foreground">Ignored files are unavailable here.</p>
      )}
      {listing && !listing.unavailable && paths.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">Nothing is ignored here.</p>
      )}
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() =>
            useShell.getState().setFileJump({ path: path.replace(/\/$/, ""), line: 0 })
          }
          className="flex w-full items-center gap-1.5 rounded-sm px-2 py-(--row-py) text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title={path.endsWith("/") ? `${path} is ignored as a whole` : path}
        >
          {path.endsWith("/") && <FolderIcon className="size-3.5 shrink-0" />}
          <span className="truncate font-mono text-xs">{path}</span>
        </button>
      ))}
      {listing?.truncated && (
        <p className="px-2 pt-1 text-xs text-muted-foreground">The list is capped.</p>
      )}
    </div>
  );
}
