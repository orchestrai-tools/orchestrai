import { Button } from "@warpforge/ui/components/button";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { cn } from "@warpforge/ui/lib/utils";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { PageToolbar } from "../../components/common/page-toolbar";
import { DOC_FOLDERS, docFolder, docsMatching } from "../../lib/doc-folders";
import { formatElapsed } from "../../lib/live-line";
import type { DocRow } from "./use-docs";

/** The library: search, then every markdown page grouped by what it is. */
export function DocNav({
  docs,
  loading,
  error,
  selected,
  onSelect,
  onRetry,
}: {
  docs: DocRow[];
  loading: boolean;
  error: string | null;
  selected: string;
  onSelect: (path: string) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = docsMatching(docs, query);
  const now = Math.floor(Date.now() / 1000);

  return (
    <nav aria-label="Library" className="flex min-h-0 flex-col border-r bg-sidebar/40">
      <PageToolbar
        title="Docs"
        meta={loading && docs.length === 0 ? undefined : docs.length === 1 ? "1 page" : `${docs.length} pages`}
        className="px-3 pt-3"
      />
      <label className="m-3 flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring/50">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages"
          aria-label="Search pages"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error && (
          <p className="flex flex-wrap items-center gap-2 px-2 pb-2 text-xs text-red-600 dark:text-red-400">
            {error}
            <Button size="xs" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </p>
        )}
        {loading && docs.length === 0 && (
          <div className="flex flex-col gap-1.5 px-2" aria-label="Loading docs">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        )}
        {DOC_FOLDERS.map((folder) => {
          const pages = shown.filter((doc) => docFolder(doc.path) === folder);
          if (!pages.length) return null;
          return (
            <section key={folder} className="mb-3">
              <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">{folder}</h2>
              <ul>
                {pages.map((doc) => (
                  <li key={doc.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(doc.path)}
                      title={doc.path}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-(--row-py) text-left text-sm",
                        doc.path === selected ? "bg-muted font-medium" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{doc.title || doc.path}</span>
                      {doc.updated != null && doc.updated > 0 && (
                        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{formatElapsed(doc.updated, now)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!loading && shown.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            {query.trim() ? `No page matches “${query.trim()}”.` : "No markdown files yet. Type a path on the right to write the first one."}
          </p>
        )}
      </div>
    </nav>
  );
}
