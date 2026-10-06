import type { AgentId } from "@/data/agents"
import type { RunStatus } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

/** Where a session began. Sessions read from an agent's own store were started outside the app. */
export type SessionOrigin = "app" | "terminal" | "acp-client" | "automation" | "fork"

/** As the agent reports it. `idle` means no process is attached; it continues with `session/load`. */
export type SessionStatus = RunStatus | "idle"

export type ToolState = "ok" | "failed" | "waiting" | "running"

export type SessionLine =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool"; text: string; state: ToolState }
  | { kind: "note"; text: string }

/** One ACP session from any agent, whoever started it. */
export interface AgentSession {
  id: string
  project: ProjectId
  agent: AgentId
  title: string
  origin: SessionOrigin
  /** Where exactly it began: the board, a terminal, a client, an automation, or the parent session. */
  source: string
  status: SessionStatus
  /** What the running turn is doing, as the agent's updates say. */
  activity?: string
  updated: string
  /** Null when the agent's store keeps no count (Codex's session files do not). */
  turns: number | null
  task?: string
  /** The account the session was created on. It resumes there. */
  account?: string
  model: string
  /** From ACP `usage` updates, in thousands of tokens. */
  context?: { used: number; size: number }
  /** API-equivalent cost, only when the agent reports one. */
  costUsd?: number
  forkedFrom?: string
  transcript: SessionLine[]
  /** What a running session streams next, so the mock's panels stay live. */
  upcoming?: SessionLine[]
}

export const ask = (text: string): SessionLine => ({ kind: "user", text })
export const say = (text: string): SessionLine => ({ kind: "agent", text })
export const think = (text: string): SessionLine => ({ kind: "thought", text })
export const note = (text: string): SessionLine => ({ kind: "note", text })
export const run = (text: string, state: ToolState = "ok"): SessionLine => ({ kind: "tool", text, state })

/** Newest first: the order a person scans them in. */
export const SESSIONS: readonly AgentSession[] = [
  {
    id: "a41c9e07", project: "orchestrai", agent: "claude", task: "orc-03", origin: "app", source: "Board · orc-03",
    title: "Docs library: rendered page and markdown editor", status: "running", activity: "Editing SyncedPreview.tsx",
    updated: "Just now", turns: 23, account: "work", model: "claude-sonnet-5.5", context: { used: 122, size: 200 }, costUsd: 4.86,
    transcript: [
      ask("Build ORC-03. Keep the editor and the rendered page in sync like Zed's preview."),
      say("The library reads through `search.rs`, so the window never parses the whole folder."),
      run("bun run typecheck · exit 0 · 14.2s"),
      say("The rendered page works. Next: map the editor cursor to a block id so the preview follows it."),
      run("Edit desktop/src/views/docs/SyncedPreview.tsx · +96 −12"),
    ],
    upcoming: [
      think("Block ids come from the parse, so only the edited page re-parses."),
      run("Edit desktop/src/views/docs/useBlockMap.ts · +71"),
      run("bun run test src/views/docs · 18 passed"),
      say("The preview now follows the active block. Wiring save through the daemon next."),
      run("Edit src/daemon/search.rs · +58 −21", "running"),
    ],
  },
  {
    id: "7c55b0d4", project: "orchestrai", agent: "goose", task: "orc-18", origin: "app", source: "Board · orc-18",
    title: "Shell truncation and unique-match edit", status: "running", activity: "Watching CI · fix attempt 2 of 3",
    updated: "1m ago", turns: 27, model: "claude-opus-5.5", context: { used: 88, size: 200 }, costUsd: 2.31,
    transcript: [
      say("Shell output past 2,000 lines now goes to a temp file, and the agent gets the path instead."),
      run("git push -u origin2 orc-18-tool-hygiene"),
      run("gh run watch 11873402 · cargo test failed", "failed"),
      say("One failure: `unique_match_rejects_ambiguous`. The fixture had two identical hunks. Fixing the fixture, not the check."),
      run("gh run watch 11873519", "running"),
    ],
    upcoming: [
      run("cargo test · 312 passed · 6m 12s"),
      say("CI is green on attempt 2 of 3. Opening the draft PR next."),
      run("gh pr create --draft --base main", "running"),
    ],
  },
  {
    id: "5be2d4f0", project: "orchestrai", agent: "codex", task: "orc-05", origin: "app", source: "Board · orc-05",
    title: "Mission Control board with continue and fork", status: "needs-you", activity: "Waiting for approval to run tests",
    updated: "2m ago", turns: 31, account: "ChatGPT Pro", model: "gpt-5.6", context: { used: 141, size: 272 }, costUsd: 3.41,
    transcript: [
      ask("ORC-05: one board for sessions from every ACP agent, with continue and fork."),
      run("Read src/daemon/sessions.rs · 256 lines"),
      say("Continue goes through `session/load`. Fork shows only for agents that advertise `session/fork`; the button stays hidden for the rest."),
      run("cargo test -p warpforge daemon::tests::sessions", "waiting"),
    ],
  },
  {
    id: "9d0e6b13", project: "orchestrai", agent: "codex", origin: "terminal", source: "codex in Ghostty · ~/projects/orchestrai",
    title: "Why does resume replay tool calls twice?", status: "idle", updated: "6m ago", turns: null, account: "ChatGPT Pro", model: "gpt-5.6",
    transcript: [
      ask("Why does resume replay tool calls twice after session/load?"),
      run("rg -n replay src/daemon/actor/transcript.rs"),
      say("The agent streams its whole transcript back during `session/load`. `transcript.rs` drops replayed updates only while the load flag is set, so late `tool_call_update` frames slip through after the reply."),
      say("Keep the replay window open until the first `turn_ended` after the load."),
    ],
  },
  {
    id: "40d7c3aa", project: "orchestrai", agent: "gemini", task: "orc-10", origin: "app", source: "Board · orc-10",
    title: "Permission profiles and modes", status: "stopped", activity: "Asking whether a project allowlist can override the denylist",
    updated: "18m ago", turns: 9, model: "gemini-3.1-pro", context: { used: 46, size: 1000 },
    transcript: [
      say("About to write the profile resolver, so a denylist entry refuses a command even when a project allowlist matches it."),
      say("Two projects allowlist `rm -rf build/`, which the global denylist blocks. Should a project allowlist be able to override it?"),
      note("Stopped and asking. The question is in the Inbox."),
    ],
  },
  {
    id: "6e19ab35", project: "orchestrai", agent: "codex", origin: "fork", source: "Fork of 5be2d4f0 at turn 18", forkedFrom: "5be2d4f0",
    title: "Mission Control board: try preset grid layouts", status: "idle", updated: "25m ago", turns: 19, account: "ChatGPT Pro", model: "gpt-5.6", costUsd: 2.06,
    transcript: [
      note("Forked from Mission Control board with continue and fork at turn 18. Later turns here do not change the original."),
      ask("Same goal, but try preset layouts instead of free tiling."),
      say("Presets (1, 2 columns, 2×2) hold up better. Free tiling made panels jump when the window resized."),
    ],
  },
  {
    id: "e3f81a92", project: "orchestrai", agent: "codex", task: "orc-08", origin: "app", source: "Board · orc-08",
    title: "Sinew bottom terminal drawer", status: "review", activity: "Stopped at merge with draft PR #214",
    updated: "35m ago", turns: 44, account: "ChatGPT Pro", model: "gpt-5.6", context: { used: 198, size: 272 }, costUsd: 4.12,
    transcript: [
      say("The drawer strip is 28 px, one tab per terminal with its status."),
      run("gh pr create --draft · #214"),
      run("gh pr checks 214 · 4 passing"),
      say("Stopped at merge, as set. Ready for your review."),
    ],
  },
  {
    id: "b2a64f18", project: "orchestrai", agent: "claude", task: "fix-resume", origin: "app", source: "Board · fix-resume",
    title: "Fix flaky resume recovery test", status: "failed", activity: "CI failed 3 of 3 attempts",
    updated: "1h ago", turns: 52, account: "work", model: "claude-sonnet-5.5", context: { used: 176, size: 200 }, costUsd: 6.02,
    transcript: [
      run("gh run watch 11872290 · resume_replays_once failed", "failed"),
      say("It passes locally 50 times in a row and fails on CI about one run in three. It looks like a timing race in replay de-duplication, not the change itself."),
      note("Stopped at the attempt cap, 3 of 3. The options are in the Inbox."),
    ],
  },
  {
    id: "c09f5e21", project: "orchestrai", agent: "claude", origin: "acp-client", source: "Zed, through Orchestrai's ACP server",
    title: "Check ADR 0024's verify stage against workflow.rs", status: "done", updated: "3h ago", turns: 6, account: "work", model: "claude-sonnet-5.5", costUsd: 0.84,
    transcript: [
      ask("Check ADR 0024's verify stage against src/daemon/workflow.rs."),
      run("Read docs/adr/0024-verify-stage.md"),
      say("It matches the ADR except one invariant: a failed verify must not reopen review, and `workflow.rs` reopens it."),
      note("Turn ended · end_turn"),
    ],
  },
  {
    id: "8a3f0c19", project: "orchestrai", agent: "goose", origin: "automation", source: "Morning triage · weekdays 7:00",
    title: "Morning triage: new GitHub issues", status: "done", updated: "8h ago", turns: 7, model: "claude-opus-5.5", costUsd: 0.52,
    transcript: [
      note("Started by the Morning triage automation"),
      run("gh issue list --label needs-triage · 4 issues"),
      say("Labelled 4 issues and drafted ORC-27 from #231: the terminal drawer loses scrollback on resize."),
    ],
  },
  {
    id: "f81d2c47", project: "orchestrai", agent: "claude", origin: "terminal", source: "claude in Terminal · ~/projects/orchestrai",
    title: "Sketch the WASM plugin host API", status: "idle", updated: "Yesterday", turns: 18, account: "personal", model: "claude-opus-5.5",
    transcript: [
      ask("Sketch a host API for WASM tool plugins, Zellij style."),
      say("Plugins reach the system only through host calls: `read_file`, `run_command` through the permission profile, and `emit_tool_result`."),
      run("Write docs/design/wasm-plugin-host.md · +142"),
    ],
  },
  {
    id: "d4b8e6f0", project: "orchestrai", agent: "claude", task: "orc-01", origin: "app", source: "Board · orc-01",
    title: "Rename to Orchestrai and give it its own data directory", status: "done", updated: "Yesterday", turns: 64, account: "work", model: "claude-sonnet-5.5", costUsd: 11.37,
    transcript: [
      say("Renamed the product and moved its data to `~/.orchestrai`. Upstream projects still load `.warpforge/workspace.yaml`."),
      run("gh pr merge 208 --squash"),
      note("Merged. Project memory written: 3 entries."),
    ],
  },
  {
    id: "b7c3e590", project: "orchestrai", agent: "codex", origin: "terminal", source: "codex in Ghostty · ~/projects/orchestrai",
    title: "Sketch a jj driver beside the git one", status: "idle", updated: "2d ago", turns: null, account: "side", model: "gpt-5.6",
    transcript: [
      ask("What would a Jujutsu driver look like next to src/daemon/worktree?"),
      say("`jj workspace add` maps to a worktree, and `jj new` replaces the branch-per-task step. Conflicts are recorded in the commit, so a failed rebase never stops a run."),
      run("jj --version · jj 0.33.0"),
    ],
  },

  {
    id: "2f7b1d90", project: "acme-web", agent: "codex", task: "web-13", origin: "app", source: "Board · web-13",
    title: "Pricing page copy refresh", status: "running", activity: "Rewriting the tier table · 3 of 5 sections",
    updated: "Just now", turns: 12, account: "ChatGPT Pro", model: "gpt-5.6", context: { used: 54, size: 272 }, costUsd: 1.27,
    transcript: [
      ask("Refresh the pricing copy. Keep the tier names; shorten every feature line to one clause."),
      run("Edit app/pricing/tiers.tsx · +38 −31"),
      say("Starter and Team are done. Business is next; it has the longest feature list."),
    ],
    upcoming: [
      run("Edit app/pricing/tiers.tsx · +17 −12"),
      say("Business is rewritten. Two sections left: Enterprise and the FAQ."),
      run("Edit app/pricing/enterprise.tsx", "running"),
    ],
  },
  {
    id: "61c0e8a4", project: "acme-web", agent: "claude", task: "web-12", origin: "app", source: "Board · web-12",
    title: "Checkout: Apple Pay button", status: "needs-you", activity: "Waiting for network access",
    updated: "4m ago", turns: 14, account: "work", model: "claude-sonnet-5.5", context: { used: 61, size: 200 }, costUsd: 1.94,
    transcript: [
      say("The Payment Request button needs `@stripe/stripe-js`, which isn't installed yet."),
      run("npm install @stripe/stripe-js@^5", "waiting"),
    ],
  },
  {
    id: "0b9e4f27", project: "acme-web", agent: "claude", origin: "terminal", source: "claude in Warp · ~/projects/acme-web",
    title: "Audit Lighthouse scores on /pricing", status: "idle", updated: "2d ago", turns: 11, account: "work", model: "claude-sonnet-5.5",
    transcript: [
      ask("Why is /pricing at 71 on mobile Lighthouse?"),
      say("Largest contentful paint is the hero: a 1.4 MB PNG with no `sizes`. AVIF at three widths gets it under 2.5 s."),
    ],
  },
  {
    id: "93ad5c18", project: "acme-web", agent: "goose", task: "web-09", origin: "app", source: "Board · web-09",
    title: "Fix CLS on the home hero", status: "done", updated: "2d ago", turns: 16, model: "claude-opus-5.5", costUsd: 1.12,
    transcript: [say("Reserved the hero's aspect ratio; CLS went from 0.21 to 0.01."), run("gh pr merge 87 --squash"), note("Merged as #87.")],
  },

  {
    id: "4c81f2e6", project: "payments", agent: "codex", task: "pay-31", origin: "app", source: "Board · pay-31",
    title: "Idempotency keys for refunds", status: "running", activity: "Writing handler tests",
    updated: "Just now", turns: 21, account: "ChatGPT Pro", model: "gpt-5.6", context: { used: 97, size: 272 }, costUsd: 2.48,
    transcript: [
      say("The migration adds `refund_requests.idempotency_key` with a unique index per merchant."),
      run("cargo sqlx migrate run · 1 applied"),
      say("Now the handler: a repeated key returns the first response instead of refunding twice."),
    ],
    upcoming: [
      run("cargo test refunds:: · 14 passed"),
      say("Handler tests pass, including two concurrent requests with the same key."),
      run("cargo clippy -p payments-api -- -D warnings", "running"),
    ],
  },
  {
    id: "a7e3049b", project: "payments", agent: "goose", task: "pay-32", origin: "app", source: "Board · pay-32",
    title: "Upgrade to Postgres 17", status: "running", activity: "Running the integration suite",
    updated: "3m ago", turns: 18, model: "claude-opus-5.5", context: { used: 73, size: 200 }, costUsd: 1.68,
    transcript: [run("docker compose up -d postgres"), say("Postgres 17 is up with the production extensions."), run("cargo test --test integration", "running")],
    upcoming: [
      run("cargo test --test integration · 88 passed"),
      say("All 88 integration tests pass on Postgres 17. Pushing and watching CI."),
      run("gh run watch 9921034", "running"),
    ],
  },
  {
    id: "1d5c7a3e", project: "payments", agent: "claude", task: "pay-29", origin: "app", source: "Board · pay-29",
    title: "Webhook signature rotation", status: "review", activity: "Draft PR #142 waiting on review",
    updated: "1h ago", turns: 37, account: "work", model: "claude-sonnet-5.5", costUsd: 3.75,
    transcript: [say("Both the old and the new secret verify during a 24-hour overlap."), run("gh pr create --draft · #142"), note("Stopped at merge, as set.")],
  },
  {
    id: "e8b2f6d1", project: "payments", agent: "codex", origin: "terminal", source: "codex in iTerm2 · ~/projects/payments-api",
    title: "Explain the refund state machine", status: "idle", updated: "5h ago", turns: null, account: "ChatGPT Pro", model: "gpt-5.6",
    transcript: [
      ask("Walk me through the refund state machine."),
      say("`Requested → Approved → Submitted → Settled`, with `Failed` reachable from Submitted. Retries only re-enter at Submitted."),
    ],
  },

  {
    id: "3f9a1c6b", project: "warpforge", agent: "codex", task: "wf-3", origin: "app", source: "Board · wf-3",
    title: "Sync ADR 0024 verify stage", status: "done", updated: "Mon", turns: 15, account: "ChatGPT Pro", model: "gpt-5.6", costUsd: 1.93,
    transcript: [say("Ported the verify stage and its tests from upstream."), run("gh pr merge 1311 --squash"), note("Merged upstream as #1311.")],
  },
  {
    id: "7e2d8b40", project: "handbook", agent: "claude", task: "hb-4", origin: "app", source: "Board · hb-4",
    title: "Rewrite the on-call guide", status: "review", activity: "Draft ready for review",
    updated: "Yesterday", turns: 22, account: "work", model: "claude-sonnet-5.5", costUsd: 1.31,
    transcript: [say("Split the guide into first hour, escalation, and handoff. Each page fits on one screen."), note("Draft ready for review.")],
  },
]
