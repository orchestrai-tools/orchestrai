import {
  DOCS_LIBRARY_FILES,
  SESSION_BOARD_FILES,
  TOOL_HYGIENE_FILES,
  type ChangedFile,
  type FileStatus,
} from "@/data/git-diffs"
import {
  APPLE_PAY_FILES,
  HANDBOOK_FILES,
  REFUND_FILES,
  SHELVED_MERMAID,
  STASHED_TILE,
  STASHED_VT100,
} from "@/data/git-diffs-more"
import type { ProjectId } from "@/lib/projects"

export type { ChangedFile, DiffLine, FileStatus, Hunk } from "@/data/git-diffs"

export interface Commit {
  hash: string
  subject: string
  author: string
  time: string
  files: { path: string; status: FileStatus }[]
}

/** A bundle of uncommitted changes the app keeps outside the repo, one shelf per worktree. */
export interface ShelfEntry {
  id: string
  name: string
  branch: string
  created: string
  files: ChangedFile[]
}

/** A git-native stash entry. The stash is one per repository, shared by every worktree. */
export interface StashEntry {
  id: string
  message: string
  branch: string
  created: string
  files: ChangedFile[]
}

/** Everything the Changes page reads about one worktree. */
export interface WorktreeGit {
  /** The tracking branch; absent until the first push creates it. */
  upstream?: string
  /** Commits on the upstream that are not here yet. */
  incoming: number
  /** Commits here that the upstream does not have, newest first. */
  outgoing: Commit[]
  /** What a task worktree merges back into. */
  base?: string
  files: ChangedFile[]
  lastCommit: { hash: string; message: string }
  /** What the text-generation agent drafts from the checked files. */
  draftMessage: string
  shelf: ShelfEntry[]
  /** Disk use, build folders included. */
  size: string
  setupLog?: string[]
}

const c = (hash: string, subject: string, time: string, files: Commit["files"], author = "Claude Code"): Commit => ({ hash, subject, author, time, files })

const GIT: Record<string, WorktreeGit> = {
  "orchestrai-main": {
    upstream: "origin/main",
    incoming: 2,
    outgoing: [],
    files: [],
    lastCommit: { hash: "40180d9", message: "Merge pull request #208 from orchestrai-tools/orc-01-rename\n\nRename to Orchestrai and give it its own data directory" },
    draftMessage: "",
    shelf: [],
    size: "4.2 GB",
  },
  "orchestrai-orc-03": {
    incoming: 0,
    base: "main",
    outgoing: [
      c("c41e9a2", "docs: task lists toggle in place", "38m ago", [{ path: "desktop/src/components/Markdown.tsx", status: "M" }, { path: "desktop/src/lib/taskListToggle.ts", status: "A" }]),
      c("9b07d13", "docs: rendered page with GFM and Mermaid", "52m ago", [{ path: "desktop/src/views/docs/Page.tsx", status: "A" }, { path: "desktop/src/components/MermaidDiagram.tsx", status: "M" }]),
      c("5f2c880", "daemon: answer docs search from the SQLite index", "1h ago", [{ path: "src/daemon/search.rs", status: "M" }, { path: "src/daemon/store/migrations/0031_pages_fts.sql", status: "A" }, { path: "src/daemon/server/dispatch/docs.rs", status: "A" }]),
      c("e8d4b61", "docs: library index with a virtualized list", "1h ago", [{ path: "desktop/src/views/docs/LibraryIndex.tsx", status: "A" }, { path: "desktop/src/views/docs/groupByFolder.ts", status: "A" }, { path: "desktop/src/store/ui/nav.ts", status: "M" }]),
    ],
    files: DOCS_LIBRARY_FILES,
    lastCommit: { hash: "c41e9a2", message: "docs: task lists toggle in place\n\nA click on a task list checkbox writes the change back to the page's source." },
    draftMessage: "docs: sync the rendered page with the editor's active block\n\nBlocks get ids from the parse, so the preview follows the block that holds the cursor. Search answers from the daemon's SQLite index; only the edited page re-parses.",
    shelf: [{ id: "shelf-1", name: "Mermaid zoom experiment", branch: "orc-03-docs-library", created: "Yesterday 17:42", files: SHELVED_MERMAID }],
    size: "14.8 GB",
    setupLog: ["$ cp .env.local (copy: .env*)", "$ bun install", "bun install v1.3.2", "+ 1,284 packages installed [8.41s]", "$ cargo fetch", "  Downloaded 412 crates (61.3 MB) in 9.20s", "setup finished in 21.4s"],
  },
  "orchestrai-orc-05": {
    incoming: 0,
    base: "main",
    outgoing: [
      c("71aa0c4", "board: continue with session/load", "1h ago", [{ path: "desktop/src/views/MissionControl.tsx", status: "M" }, { path: "src/daemon/acp/session/load.rs", status: "M" }], "Codex"),
      c("2d93f5e", "board: list sessions from every ACP agent", "1h ago", [{ path: "src/daemon/acp_server.rs", status: "M" }, { path: "desktop/src/views/mission-control/SessionTile.tsx", status: "A" }], "Codex"),
    ],
    files: SESSION_BOARD_FILES,
    lastCommit: { hash: "71aa0c4", message: "board: continue with session/load" },
    draftMessage: "board: fork a session when the agent advertises it\n\nThe Fork button is hidden for agents without session/fork rather than shown disabled. Resume moves into the tile's own Continue action.",
    shelf: [],
    size: "2.1 GB",
    setupLog: ["$ cp .env.local (copy: .env*)", "$ bun install", "+ 1,284 packages installed [7.96s]", "setup finished in 9.1s"],
  },
  "orchestrai-orc-08": {
    upstream: "origin/orc-08-terminal-drawer",
    incoming: 0,
    base: "main",
    outgoing: [],
    files: [],
    lastCommit: { hash: "b3c0e75", message: "terminal: keep the drawer's scroll position when it closes" },
    draftMessage: "",
    shelf: [],
    size: "15.2 GB",
  },
  "orchestrai-orc-18": {
    upstream: "origin/orc-18-tool-hygiene",
    incoming: 0,
    base: "main",
    outgoing: [],
    files: TOOL_HYGIENE_FILES,
    lastCommit: { hash: "0f6a2d9", message: "mcp: refuse an edit whose old text matches twice (fix attempt 2)" },
    draftMessage: "mcp: keep the tail of clipped tool output (fix attempt 3)\n\nThe failing test reads the last lines of a long run; the full output goes to a temp file whose path is in the result.",
    shelf: [],
    size: "9.7 GB",
  },
  "acme-web-main": { upstream: "origin/main", incoming: 0, outgoing: [], files: [], lastCommit: { hash: "a91f003", message: "Merge pull request #87 from acme/hero-cls" }, draftMessage: "", shelf: [], size: "1.3 GB" },
  "acme-web-pay": {
    incoming: 0,
    base: "main",
    outgoing: [c("6c1d2be", "checkout: payment method section", "20m ago", [{ path: "src/checkout/PaymentMethods.tsx", status: "M" }])],
    files: APPLE_PAY_FILES,
    lastCommit: { hash: "6c1d2be", message: "checkout: payment method section" },
    draftMessage: "checkout: Apple Pay button above the card form\n\nShown only in Safari with a card in Wallet, for US sessions; the card form stays as the fallback.",
    shelf: [],
    size: "1.1 GB",
  },
  "payments-main": { upstream: "origin/develop", incoming: 0, outgoing: [], files: [], lastCommit: { hash: "1e0b7aa", message: "Merge pull request #140 from acme/pg17-prep" }, draftMessage: "", shelf: [], size: "860 MB" },
  "payments-refund": {
    incoming: 0,
    base: "develop",
    outgoing: [
      c("d22f1a8", "refunds: store request hash beside the key", "25m ago", [{ path: "internal/refunds/store.go", status: "M" }], "Codex"),
      c("8a4c3e1", "refunds: idempotency key header on POST /refunds", "34m ago", [{ path: "internal/refunds/handler.go", status: "M" }, { path: "api/openapi.yaml", status: "M" }], "Codex"),
    ],
    files: REFUND_FILES,
    lastCommit: { hash: "d22f1a8", message: "refunds: store request hash beside the key" },
    draftMessage: "refunds: replay a refund created under the same idempotency key\n\nThe unique index on (merchant_id, key) makes racing requests safe. A replay answers 201 with Idempotent-Replayed: true.",
    shelf: [],
    size: "1.4 GB",
  },
  "warpforge-main": { upstream: "origin/main", incoming: 0, outgoing: [], files: [], lastCommit: { hash: "7d2e5c1", message: "Merge pull request #1311 from warpforgehq/sync-adr-0024" }, draftMessage: "", shelf: [], size: "3.9 GB" },
  "handbook-main": {
    upstream: "origin/main",
    incoming: 0,
    outgoing: [],
    files: HANDBOOK_FILES,
    lastCommit: { hash: "5b81d0e", message: "oncall: link the severity table" },
    draftMessage: "oncall: page the secondary after 10 minutes\n\nThe pager escalates on its own now, and the incident commander replaces the manager as the last call.",
    shelf: [],
    size: "48 MB",
  },
}

const EMPTY: WorktreeGit = { incoming: 0, outgoing: [], files: [], lastCommit: { hash: "", message: "" }, draftMessage: "", shelf: [], size: "—" }

export function gitFor(worktreeId: string): WorktreeGit {
  return GIT[worktreeId] ?? EMPTY
}

export const STASH: Partial<Record<ProjectId, StashEntry[]>> = {
  orchestrai: [
    { id: "stash@{0}", message: "WIP fork button styles", branch: "orc-05-session-board", created: "Today 10:31", files: STASHED_TILE },
    { id: "stash@{1}", message: "try vt100 0.16", branch: "main", created: "Mon 16:05", files: STASHED_VT100 },
  ],
}

export const BRANCHES: Partial<Record<ProjectId, { local: string[]; remote: string[] }>> = {
  orchestrai: {
    local: ["main", "orc-01-rename", "orc-02-upstream-sync", "orc-03-docs-library", "orc-05-session-board", "orc-08-terminal-drawer", "orc-10-permission-profiles", "orc-18-tool-hygiene", "fix-resume-flake", "spike/zed-base"],
    remote: ["origin/main", "origin/orc-08-terminal-drawer", "origin/orc-18-tool-hygiene", "origin/fix-resume-flake", "upstream/main"],
  },
  "acme-web": { local: ["main", "checkout-apple-pay", "pricing-copy", "hero-cls"], remote: ["origin/main", "origin/pricing-copy"] },
  payments: { local: ["develop", "main", "refund-idempotency", "pg17", "webhook-rotation"], remote: ["origin/develop", "origin/main", "origin/webhook-rotation", "origin/pg17"] },
  warpforge: { local: ["main", "sync-adr-0024"], remote: ["origin/main"] },
  handbook: { local: ["main", "on-call-guide"], remote: ["origin/main", "origin/on-call-guide"] },
}

/** What `.gitignore` hides, as the toggle lists it: whole ignored folders collapse to one row. */
export const IGNORED: Partial<Record<ProjectId, string[]>> = {
  orchestrai: ["target/", "desktop/node_modules/", "desktop/dist/", "desktop/src-tauri/target/", ".env.local", "desktop/.env.local"],
  "acme-web": ["node_modules/", ".next/", ".env.local"],
  payments: ["bin/", ".env"],
}

export const DISK = { volume: "Macintosh HD", free: "18.2 GB", freeGb: 18.2 }
