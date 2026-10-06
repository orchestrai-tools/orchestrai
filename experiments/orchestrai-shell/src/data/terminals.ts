import type { ProjectId } from "@/lib/projects"

export type TerminalStatus = "starting" | "running" | "exited"

/** A command run as one block, with its own exit code and working directory (Warp's model). */
export interface CommandBlock {
  command: string
  cwd: string
  output: string[]
  exit?: number
  duration?: string
}

export interface TerminalSession {
  id: string
  title: string
  status: TerminalStatus
  exit?: number
  blocks: CommandBlock[]
}

const DEV_SERVER: CommandBlock = {
  command: "bun run tauri dev",
  cwd: "~/projects/orchestrai/desktop",
  output: [
    "  VITE v8.3.0  ready in 241 ms",
    "  ➜  Local:   http://localhost:1420/",
    "     Running BeforeDevCommand (`bun run dev`)",
    "     Compiling warpforge v0.21.1 (/Users/dev/projects/orchestrai)",
    "      Finished `dev` profile [unoptimized + debuginfo] target(s) in 38.12s",
    "       Running `target/debug/warpforge-desktop`",
    "daemon: listening on ws://127.0.0.1:61814",
  ],
}

export const TERMINALS: Record<ProjectId, TerminalSession[]> = {
  orchestrai: [
    { id: "dev", title: "tauri dev", status: "running", blocks: [DEV_SERVER] },
    {
      id: "tests",
      title: "cargo test",
      status: "exited",
      exit: 0,
      blocks: [
        { command: "cargo fmt --all -- --check", cwd: "~/projects/orchestrai", output: [], exit: 0, duration: "1.9s" },
        { command: "cargo test -p warpforge daemon::tests::sessions", cwd: "~/projects/orchestrai", output: ["running 24 tests", "test sessions::resume::replays_once ... ok", "test sessions::fork::second_tile_is_independent ... ok", "test result: ok. 24 passed; 0 failed; finished in 18.42s"], exit: 0, duration: "41s" },
      ],
    },
    { id: "shell", title: "zsh", status: "starting", blocks: [] },
  ],
  "acme-web": [{ id: "dev", title: "next dev", status: "running", blocks: [{ command: "pnpm dev", cwd: "~/projects/acme-web", output: ["▲ Next.js 16.1", "- Local: http://localhost:4100", "✓ Ready in 1.2s"] }] }],
  payments: [{ id: "dev", title: "api", status: "running", blocks: [{ command: "cargo run --bin api", cwd: "~/projects/payments-api", output: ["listening on 0.0.0.0:4200"] }] }],
  warpforge: [{ id: "dev", title: "zsh", status: "exited", exit: 0, blocks: [{ command: "git pull --ff-only", cwd: "~/projects/warpforge", output: ["Already up to date."], exit: 0, duration: "0.8s" }] }],
  handbook: [{ id: "dev", title: "zsh", status: "exited", exit: 1, blocks: [{ command: "markdownlint '**/*.md'", cwd: "~/docs/handbook", output: ["on-call.md:14 MD013/line-length Line length [Expected: 120; Actual: 141]"], exit: 1, duration: "2.1s" }] }],
}

/** QuickRun suggestions, scoped to the selected worktree: saved commands, package scripts, history. */
export const QUICK_RUN: Record<"saved" | "scripts" | "history", string[]> = {
  saved: ["cargo clippy --locked --all-targets -- -D warnings", "bun run lint && bun run typecheck"],
  scripts: ["bun run dev", "bun run test", "bun run tauri dev", "bun run changeset"],
  history: ["git status", "cargo test -p warpforge daemon::tests::sessions", "gh pr checks 214"],
}
