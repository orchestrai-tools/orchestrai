import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";
import { buildHandoffSeed, canContinueHere, defaultCarryMode } from "@warpforge/core/continueSession";
import { buildConversationBranchPrompt } from "@warpforge/core/conversationBranch";
import { estimateTokens } from "@warpforge/core/tokenEstimate";

const task = {
  agent: "claude",
  blockedKind: "session_lost",
  blockedReason: "rejected ACP session/load",
  createdAt: 1,
  filesChanged: 0,
  id: "t_source",
  project: "lingoverse",
  prompt: "Integrate the speech provider",
  status: "blocked",
  tags: [],
  title: "",
  updatedAt: 1,
} satisfies TaskInfo;

describe("continue session", () => {
  it("carries a short conversation verbatim and summarises a long one", () => {
    expect(defaultCarryMode(estimateTokens("short talk"))).toBe("full");
    expect(defaultCarryMode(estimateTokens("word ".repeat(40_000)))).toBe("summary");
  });

  it("continues in place only when the same agent has lost the session", () => {
    expect(canContinueHere(task, "claude")).toBe(true);
    expect(canContinueHere(task, "codex")).toBe(false);
    expect(canContinueHere({ ...task, blockedKind: null, status: "waiting" }, "claude")).toBe(false);
  });

  it("seeds a handoff that names the source and the worktree", () => {
    const seed = buildHandoffSeed({ ...task, worktree: "/tmp/wt" }, "## Goal\nShip the provider");
    expect(seed).toContain("t_source");
    expect(seed).toContain("git worktree at /tmp/wt");
    expect(seed).toContain("## Goal\nShip the provider");
  });

  it("includes the tool call and the files touched up to the branch point", () => {
    const updates = [
      { kind: "user_message", text: "Fix the build" },
      { kind: "tool_call", title: "cargo test", status: "failed", content: "error" },
      { kind: "file_edit", path: "src/main.rs", additions: 2, deletions: 1 },
      { kind: "agent_text", text: "later" },
    ] as SessionUpdate[];
    const prompt = buildConversationBranchPrompt(task, updates, 2);
    expect(prompt).toContain("cargo test");
    expect(prompt).toContain("src/main.rs");
    expect(prompt).not.toContain("later");
  });
});
