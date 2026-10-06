import { useState } from "react"
import { FileTextIcon, SearchIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { DOC_FOLDERS, docsFor, findDoc, type Doc } from "@/data/docs"
import { taskDetail } from "@/data/task-detail"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { selectSelection } from "@/lib/window-store"
import { MarkdownEditor } from "@/pages/task/plan-pane"

function sourceOf(doc: Doc) {
  return doc.markdown || taskDetail(doc.task)?.plan || ""
}

/**
 * The docs library: the agents' plans and transcripts beside the wiki, all
 * as rendered pages with an editor one toggle away. People here read more
 * than they write, so the reading surface is designed first.
 */
export function DocsPage() {
  const project = useAppSession((session) => session.project)
  const selected = useAppSession((session) => selectSelection(session, "doc"))
  const { select } = useAppActions()
  const [query, setQuery] = useState("")

  const all = docsFor(project)
  const needle = query.trim().toLowerCase()
  const docs = needle
    ? all.filter((doc) => doc.title.toLowerCase().includes(needle) || sourceOf(doc).toLowerCase().includes(needle))
    : all
  const doc = findDoc(selected) && all.some((entry) => entry.id === selected) ? findDoc(selected)! : all[0]

  return (
    <div className="grid h-full grid-cols-[15rem_1fr]">
      <nav aria-label="Library" className="flex min-h-0 flex-col border-r bg-sidebar/40">
        <PageToolbar title="Docs" meta={`${all.length} pages`} className="px-3 pt-3" />
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
          {DOC_FOLDERS.map((folder) => {
            const pages = docs.filter((entry) => entry.folder === folder)
            if (!pages.length) return null
            return (
              <section key={folder} className="mb-3">
                <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">{folder}</h2>
                <ul>
                  {pages.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => select("doc", entry.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-(--row-py) text-left text-sm",
                          entry.id === doc?.id ? "bg-muted font-medium" : "hover:bg-muted/60"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{entry.updated}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {docs.length === 0 && <p className="px-2 text-xs text-muted-foreground">No page matches “{query}”.</p>}
        </div>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">2,014 pages indexed · search 38 ms</p>
      </nav>

      <div className="min-h-0 overflow-y-auto">
        {doc ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-8 py-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileTextIcon className="size-3.5" />
              <span className="font-mono">{doc.path}</span>
              <span aria-hidden>·</span>
              <span>Updated {doc.updated}</span>
              {doc.task && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => select("task", doc.task!, "task")}>
                  Open the task that wrote it
                </Button>
              )}
            </div>
            <MarkdownEditor key={doc.id} initial={sourceOf(doc)} label={doc.folder} />
          </div>
        ) : (
          <p className="p-8 text-sm text-muted-foreground">This project has no pages yet.</p>
        )}
      </div>
    </div>
  )
}
