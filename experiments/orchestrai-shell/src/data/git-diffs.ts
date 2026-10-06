/** Git status letters, as the staging tree shows them. `U` is untracked (not in git yet). */
export type FileStatus = "M" | "A" | "D" | "R" | "U"

export interface DiffLine {
  kind: "context" | "add" | "del"
  text: string
  oldNo?: number
  newNo?: number
}

export interface Hunk {
  oldStart: number
  newStart: number
  /** The enclosing function or block git prints after the range. */
  section: string
  lines: DiffLine[]
}

/** One changed file in a worktree. The counts are the whole file's; the hunks may be a preview of it. */
export interface ChangedFile {
  path: string
  status: FileStatus
  /** For a rename, the path it came from. */
  from?: string
  additions: number
  deletions: number
  hunks: Hunk[]
}

/** Parses a unified-diff body (each line led by " ", "+" or "-") into numbered lines. */
export function hunk(oldStart: number, newStart: number, section: string, body: string): Hunk {
  let oldNo = oldStart
  let newNo = newStart
  const lines = body
    .replace(/^\n/, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((raw): DiffLine => {
      const text = raw.slice(1)
      if (raw.startsWith("+")) return { kind: "add", text, newNo: newNo++ }
      if (raw.startsWith("-")) return { kind: "del", text, oldNo: oldNo++ }
      return { kind: "context", text, oldNo: oldNo++, newNo: newNo++ }
    })
  return { oldStart, newStart, section, lines }
}

export function countLines(hunks: Hunk[]) {
  let additions = 0
  let deletions = 0
  for (const entry of hunks) {
    for (const line of entry.lines) {
      if (line.kind === "add") additions++
      if (line.kind === "del") deletions++
    }
  }
  return { additions, deletions }
}

/** A file whose counts come from its hunks, unless the hunks are only a preview of a larger change. */
export function file(
  path: string,
  status: FileStatus,
  hunks: Hunk[],
  options: { total?: { additions: number; deletions: number }; from?: string } = {}
): ChangedFile {
  const shown = countLines(hunks)
  return { path, status, from: options.from, hunks, ...(options.total ?? shown) }
}

const LIBRARY = hunk(0, 1, "", `
+import { useVirtualizer } from "@tanstack/react-virtual";
+import { useMemo, useRef, useState } from "react";
+
+import type { DocEntry } from "../../protocol/docs";
+import { groupByFolder } from "./groupByFolder";
+import { useDocSearch } from "./useDocSearch";
+
+/** Folder rows and page rows, flattened so 2,000 pages scroll as one list. */
+const ROW_HEIGHT = 28;
+
+export function Library({ project, onOpen }: { project: string; onOpen: (doc: DocEntry) => void }) {
+  const [query, setQuery] = useState("");
+  const scrollRef = useRef<HTMLDivElement>(null);
+  const { entries, tookMs } = useDocSearch(project, query);
+  const rows = useMemo(() => groupByFolder(entries), [entries]);
+  const virtualizer = useVirtualizer({
+    count: rows.length,
+    estimateSize: () => ROW_HEIGHT,
+    getScrollElement: () => scrollRef.current,
+    overscan: 20,
+  });
`)

const SYNCED_PREVIEW = hunk(1, 1, "", `
-import { Markdown } from "../../components/Markdown";
+import { useEffect, useRef } from "react";
 
-/** Read-only rendering of a docs page. */
-export function Preview({ source }: { source: string }) {
-  return (
-    <div className="docs-preview">
-      <Markdown density="comfortable">{source}</Markdown>
-    </div>
-  );
+import { Markdown } from "../../components/Markdown";
+import { useBlockMap } from "./useBlockMap";
+
+/** The rendered page, kept on the block that holds the editor's cursor. */
+export function SyncedPreview({ source, cursorLine }: { source: string; cursorLine: number }) {
+  const ref = useRef<HTMLDivElement>(null);
+  const map = useBlockMap(source);
+  const active = map.at(cursorLine);
+
+  useEffect(() => {
+    if (!active) return;
+    const node = ref.current?.querySelector('[data-block="' + active.id + '"]');
+    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
+  }, [active]);
+
+  return (
+    <div ref={ref} className="docs-preview">
+      <Markdown density="comfortable" blockIds>
+        {source}
+      </Markdown>
+    </div>
+  );
 }
`)

const BLOCK_MAP = hunk(0, 1, "", `
+import { fromMarkdown } from "mdast-util-from-markdown";
+import { useMemo } from "react";
+
+/** One top-level block of a page: its id, and the source lines it spans. */
+export interface Block {
+  id: string;
+  startLine: number;
+  endLine: number;
+}
+
+/**
+ * Block ids come from the parse, not from line numbers, so typing a line
+ * above a block does not change which block the preview follows.
+ */
+export function useBlockMap(source: string) {
+  return useMemo(() => {
+    const tree = fromMarkdown(source);
+    const blocks: Block[] = tree.children.map((node, index) => ({
+      id: node.type + "-" + index,
+      startLine: node.position?.start.line ?? 0,
+      endLine: node.position?.end.line ?? 0,
+    }));
+    return {
+      blocks,
+      at: (line: number) => blocks.find((block) => line >= block.startLine && line <= block.endLine),
+    };
+  }, [source]);
+}
`)

const SEARCH_RS = [
  hunk(14, 14, "use rusqlite::Connection;", `
 use anyhow::Result;
 use rusqlite::{params, Connection};
 
-/// Full-text search over task transcripts.
+/// Full-text search over transcripts and docs pages. One FTS5 table holds
+/// both, so the library and the transcript search answer from one query.
 pub struct SearchIndex {
     conn: Connection,
+    /// Rows one answer may return; the library pages past it.
+    limit: usize,
 }
`),
  hunk(61, 64, "impl SearchIndex {", `
     pub fn search(&self, query: &str) -> Result<Vec<Hit>> {
-        let mut stmt = self.conn.prepare(
-            "SELECT task_id, snippet(transcripts, 1, '[', ']', '…', 12) FROM transcripts WHERE transcripts MATCH ?1",
-        )?;
-        let rows = stmt.query_map(params![query], |row| Ok(Hit::transcript(row.get(0)?, row.get(1)?)))?;
+        let mut stmt = self.conn.prepare_cached(
+            "SELECT kind, ref_id, path, snippet(pages, 3, '[', ']', '…', 12), bm25(pages)
+             FROM pages WHERE pages MATCH ?1 ORDER BY bm25(pages) LIMIT ?2",
+        )?;
+        let rows = stmt.query_map(params![fts_query(query), self.limit as i64], Hit::from_row)?;
         rows.collect::<rusqlite::Result<_>>().map_err(Into::into)
     }
+
+    /// Index one docs page, replacing whatever the index held for its path.
+    pub fn index_page(&self, path: &str, title: &str, body: &str) -> Result<()> {
+        self.conn.execute("DELETE FROM pages WHERE path = ?1", params![path])?;
+        self.conn.execute(
+            "INSERT INTO pages (kind, ref_id, path, title, body) VALUES ('doc', NULL, ?1, ?2, ?3)",
+            params![path, title, body],
+        )?;
+        Ok(())
+    }
`),
]

const MARKDOWN_TSX = [
  hunk(1, 1, "", `
 import ReactMarkdown from "react-markdown";
 import remarkGfm from "remark-gfm";
 
+import { rehypeBlockIds } from "../lib/rehypeBlockIds";
 import { MermaidDiagram } from "./MermaidDiagram";
`),
  hunk(40, 41, "export function Markdown({", `
   return (
-    <div className={cn("markdown", density === "compact" && "markdown-compact", className)}>
-      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
+    <div className={cn("markdown", density === "compact" && "markdown-compact", className)}>
+      <ReactMarkdown
+        remarkPlugins={[remarkGfm]}
+        rehypePlugins={blockIds ? [rehypeBlockIds] : []}
+        components={components}
+      >
         {children}
       </ReactMarkdown>
     </div>
   );
`),
]

const PROTOCOL_DOCS = hunk(0, 1, "", `
+/** One markdown page in the docs library, as \`docs.list\` returns it. */
+export interface DocEntry {
+  path: string;
+  title: string;
+  folder: string;
+  /** Project name, or null for the global library. */
+  project: string | null;
+  updatedAt: number;
+  /** Set when a task wrote the page (plans, transcripts). */
+  taskId?: string | null;
+}
+
+export interface DocSearchResult {
+  entries: DocEntry[];
+  /** Milliseconds the daemon's index took to answer. */
+  tookMs: number;
+  truncated: boolean;
+}
+
+export interface DocSave {
+  path: string;
+  content: string;
+  /** The mtime the editor loaded; a newer file on disk refuses the save. */
+  baseMtime: number;
+}
`)

/** The orc-03 worktree: the docs library, mid-way through syncing the editor with the page. */
export const DOCS_LIBRARY_FILES: ChangedFile[] = [
  file("desktop/src/views/docs/Library.tsx", "A", [LIBRARY], { total: { additions: 184, deletions: 0 } }),
  file("desktop/src/views/docs/SyncedPreview.tsx", "R", [SYNCED_PREVIEW], { total: { additions: 96, deletions: 12 }, from: "desktop/src/views/docs/Preview.tsx" }),
  file("src/daemon/search.rs", "M", SEARCH_RS, { total: { additions: 58, deletions: 21 } }),
  file("desktop/src/components/Markdown.tsx", "M", MARKDOWN_TSX, { total: { additions: 33, deletions: 18 } }),
  file("desktop/src/views/docs/useBlockMap.ts", "U", [BLOCK_MAP], { total: { additions: 71, deletions: 0 } }),
  file("desktop/src/protocol/docs.ts", "U", [PROTOCOL_DOCS], { total: { additions: 44, deletions: 0 } }),
]

/** The orc-05 worktree: Fork beside Continue on the session board. */
export const SESSION_BOARD_FILES: ChangedFile[] = [
  file("desktop/src/views/MissionControl.tsx", "M", [
    hunk(88, 88, "export default function MissionControl({", `
   const sessions = useSessionList();
+  const agents = useAgentCapabilities();
   const pinned = usePinnedTasks();
 
   return (
     <div className="mission-control grid">
       {sessions.map((session) => (
-        <SessionTile key={session.id} session={session} onContinue={continueSession} />
+        <SessionTile
+          key={session.id}
+          session={session}
+          onContinue={continueSession}
+          // Fork exists only when the agent advertises session/fork.
+          onFork={agents.get(session.agent)?.fork ? forkSession : undefined}
+        />
       ))}
`),
    hunk(140, 148, "export default function MissionControl({", `
   const continueSession = (session: SessionSummary) => openTask(session.taskId);
+
+  const forkSession = async (session: SessionSummary) => {
+    const forked = await daemon.request("session.fork", {
+      agent: session.agent,
+      session_id: session.id,
+    });
+    openTask(forked.taskId);
+  };
`),
  ], { total: { additions: 41, deletions: 9 } }),
  file("desktop/src/views/mission-control/SessionTile.tsx", "M", [
    hunk(12, 12, "interface Props {", `
   session: SessionSummary;
   onContinue: (session: SessionSummary) => void;
+  /** Absent when the agent cannot fork; the button is hidden, not disabled. */
+  onFork?: (session: SessionSummary) => void;
 }
 
-export function SessionTile({ session, onContinue }: Props) {
+export function SessionTile({ session, onContinue, onFork }: Props) {
`),
    hunk(54, 56, "export function SessionTile({ session, onContinue, onFork }: Props) {", `
         <Button size="sm" variant="ghost" onClick={() => onContinue(session)}>
           Continue
         </Button>
+        {onFork && (
+          <Button size="sm" variant="ghost" onClick={() => onFork(session)}>
+            Fork
+          </Button>
+        )}
`),
  ], { total: { additions: 36, deletions: 4 } }),
  file("desktop/src/views/mission-control/ResumeButton.tsx", "D", [
    hunk(1, 0, "", `
-import { RotateCcw } from "lucide-react";
-
-import { Button } from "@/components/ui/button";
-
-/** Superseded by the tile's own Continue and Fork actions. */
-export function ResumeButton({ onResume }: { onResume: () => void }) {
-  return (
-    <Button size="sm" variant="ghost" onClick={onResume} title="Resume session">
-      <RotateCcw className="size-3.5" />
-      Resume
-    </Button>
-  );
-}
`),
  ], { total: { additions: 0, deletions: 27 } }),
]

/** The orc-18 worktree: fix attempt 3 in progress, keeping the tail of a long log. */
export const TOOL_HYGIENE_FILES: ChangedFile[] = [
  file("src/mcp/logs.rs", "M", [
    hunk(31, 31, "pub(crate) fn clip_output(output: &str, max_lines: usize) -> Result<Clipped> {", `
     let lines: Vec<&str> = output.lines().collect();
     if lines.len() <= max_lines {
         return Ok(Clipped::whole(output));
     }
-    let head = lines[..max_lines].join("\\n");
-    Ok(Clipped { text: head, truncated: true, full_path: None })
+    // The model needs the end of a failing run, not its start.
+    let tail = lines[lines.len() - max_lines..].join("\\n");
+    let full_path = spill_to_temp(output)?;
+    Ok(Clipped {
+        text: tail,
+        truncated: true,
+        full_path: Some(full_path),
+    })
 }
`),
  ]),
]
