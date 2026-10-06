import { PROJECT_DIR, type TaskInfo } from "@warpforge/protocol";
import { demoGitFixture } from "./demo-git";

/** Drop finished tasks that have no local changes. Dirty worktrees stay. */
export function demoDeleteSettled(tasks: TaskInfo[], project: string): { tasks: TaskInfo[]; deleted: number; kept: number } {
  let deleted = 0;
  let kept = 0;
  const next = tasks.filter((task) => {
    if (task.project !== project || task.status !== "done") return true;
    if (task.filesChanged > 0) {
      kept += 1;
      return true;
    }
    deleted += 1;
    return false;
  });
  return { deleted, kept, tasks: next };
}

/** Extra demo responses that do not need the live snapshot. */
export function demoFixture(method: string, params?: unknown): Promise<unknown> | null {
  const p = (params ?? {}) as Record<string, unknown>;
  if (method === "file.contents" && p.path === `${PROJECT_DIR}/workflows/review-loop.yaml`) {
    return Promise.resolve({
      newText: "review:\n  on_limit: ask\n  reviewers:\n    - agent: codex\n      prompt: Review {{diff}} in round {{round}}.\n",
      oldText: "",
      path: p.path,
      status: "unchanged",
    });
  }
  if (method === "workflow.list") {
    return Promise.resolve({
      workflows: [
        {
          description: "Implement, then review until it passes.",
          id: "review-loop",
          maxRounds: 3,
          name: "Implement + review loop",
          source: "project",
          stageAgents: [null, null, null],
          stages: ["implement", "review", "fix"],
          valid: true,
        },
      ],
    });
  }
  if (method === "automation.list") {
    const now = Math.floor(Date.now() / 1000);
    return Promise.resolve({
      automations: [
        {
          agent: "claude",
          createdAt: now - 86400,
          enabled: true,
          id: "demo-automation",
          lastRunAt: now - 120,
          lastStatus: "completed",
          lastTaskId: "demo-task",
          missedRunGraceMinutes: 720,
          name: "Morning sketch",
          nextRunAt: now + 3600,
          project: "demo",
          prompt: "Sketch the next slice of the shell.",
          reuseSession: false,
          trigger: { cron: "0 9 * * 1-5", preset: "weekdays" },
          timezone: "",
          updatedAt: now - 120,
          worktree: false,
        },
      ],
    });
  }
  if (method === "automation.runs") {
    const now = Math.floor(Date.now() / 1000);
    return Promise.resolve({
      runs: [
        {
          automationId: String(p.id),
          finishedAt: now - 90,
          id: "demo-run-1",
          output: "The board columns are in place.",
          runNumber: 1,
          scheduledFor: now - 120,
          startedAt: now - 120,
          status: "completed",
          taskId: "demo-task",
          trigger: "manual",
        },
      ],
    });
  }
  const git = demoGitFixture(method);
  if (git) return git;
  if (method === "memory.stats") {
    return Promise.resolve({
      embeddingMode: "fts",
      globalCount: 0,
      perProjectDbExists: true,
      projectCount: 1,
      scopesEnabled: { global: true, project: true },
    });
  }
  if (method === "memory.list" || method === "memory.search") {
    const memory = {
      content: "The board is a project shell.",
      createdAt: 1,
      id: "mem-board",
      kind: "decision",
      lastAccessed: 1,
      scope: "project:demo",
      tags: ["shell"],
      updatedAt: 1,
    };
    const query = String(p.query ?? "").toLowerCase();
    if (method === "memory.search" && query && !memory.content.toLowerCase().includes(query)) {
      return Promise.resolve([]);
    }
    return Promise.resolve([memory]);
  }
  if (method === "runner.status") {
    return Promise.resolve({
      entries: [
        {
          agent: "claude",
          deliver: true,
          enqueuedAt: 1,
          number: 4,
          position: 0,
          priority: "normal",
          project: "demo",
          state: "queued",
          taskId: "demo-factory",
          title: "Queue the column",
          updatedAt: 1,
          wait: { inUse: 1, kind: "slots", limit: 1 },
        },
      ],
    });
  }
  if (method === "workflow.evidence" && p.name === "board.png") {
    return Promise.resolve({
      contentType: "image/png",
      dataBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    });
  }
  if (method === "memory.listCompaction") return Promise.resolve({ proposals: [] });
  if (method === "task.pullRequests") {
    return Promise.resolve({
      pullRequests: {
        "demo-task": {
          checks: "failing",
          failedChecks: [
            {
              name: "ci / lint",
              state: "failing",
              summary: "Lint failed",
              url: "https://github.com/orchestrai/demo/actions/runs/2",
            },
          ],
          number: 7,
          state: "open",
          title: "Sketch the shell",
          url: "https://github.com/orchestrai/demo/pull/7",
        },
      },
    });
  }
  if (method === "tracker.pulls.list") {
    const search = String(p.search ?? "").toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    const items = [
      {
        additions: 3,
        assignees: ["ada"],
        author: { login: "ada" },
        baseRefName: "main",
        changedFiles: 2,
        createdAt: now - 7200,
        deletions: 2,
        draft: false,
        headRefName: "feat/shell",
        labels: [{ color: "1f6feb", name: "shell" }],
        number: 7,
        project: "demo",
        repo: "orchestrai/demo",
        reviewDecision: "REVIEW_REQUIRED",
        state: "open",
        title: "Sketch the shell",
        updatedAt: now - 600,
        url: "https://github.com/orchestrai/demo/pull/7",
      },
      {
        additions: 1,
        assignees: [],
        author: { login: "ada" },
        baseRefName: "main",
        changedFiles: 0,
        createdAt: now - 86400,
        deletions: 0,
        draft: true,
        headRefName: "notes",
        labels: [],
        number: 8,
        project: "demo",
        repo: "orchestrai/demo",
        state: "open",
        title: "Notes for later",
        updatedAt: now - 3600,
        url: "https://github.com/orchestrai/demo/pull/8",
      },
    ].filter((item) => {
      if (p.assigned_to_me === true) return false;
      if (!search) return true;
      return item.title.toLowerCase().includes(search) || String(item.number) === search;
    });
    return Promise.resolve({ items });
  }
  if (method === "tracker.pulls.details") {
    const draft = Number(p.number) === 8;
    return Promise.resolve({
      additions: draft ? 1 : 3,
      baseRefName: "main",
      body: draft ? "Still a draft." : "The board is a project shell.",
      changedFiles: draft ? 0 : 2,
      deletions: draft ? 0 : 2,
      draft,
      headRefName: draft ? "notes" : "feat/shell",
      reviewDecision: draft ? null : "REVIEW_REQUIRED",
      reviewRequests: draft ? [] : ["linus"],
      state: "open",
      title: draft ? "Notes for later" : "Sketch the shell",
      url: draft ? "https://github.com/orchestrai/demo/pull/8" : "https://github.com/orchestrai/demo/pull/7",
    });
  }
  if (method === "tracker.pulls.diff" && Number(p.number) === 8) {
    return Promise.resolve({ additions: 0, deletions: 0, files: [], patch: "", truncated: false });
  }
  if (method === "tracker.pulls.diff" && String(p.to_oid) === "aaa111") {
    return Promise.resolve({
      additions: 2,
      deletions: 1,
      files: [{ additions: 2, deletions: 1, path: "src/board.tsx" }],
      patch: [
        "diff --git a/src/board.tsx b/src/board.tsx",
        "--- a/src/board.tsx",
        "+++ b/src/board.tsx",
        "@@ -1,2 +1,3 @@",
        " columns",
        "-shell",
        "+project shell",
        "+visible",
      ].join("\n"),
      truncated: false,
    });
  }
  if (method === "tracker.pulls.diff") {
    return Promise.resolve({
      additions: 3,
      deletions: 2,
      files: [
        { additions: 2, deletions: 1, path: "src/board.tsx" },
        { additions: 1, deletions: 1, path: "docs/board.md" },
      ],
      patch: [
        "diff --git a/src/board.tsx b/src/board.tsx",
        "--- a/src/board.tsx",
        "+++ b/src/board.tsx",
        "@@ -1,2 +1,3 @@",
        " columns",
        "-shell",
        "+project shell",
        "+visible",
        "diff --git a/README.md b/docs/board.md",
        "--- a/README.md",
        "+++ b/docs/board.md",
        "@@ -1 +1 @@",
        "-# Board",
        "+# Project board",
      ].join("\n"),
      truncated: false,
    });
  }
  if (method === "tracker.pulls.commits") {
    if (Number(p.number) === 8) {
      return Promise.resolve({
        items: [
          {
            abbreviatedOid: "ccc333",
            author: { login: "ada" },
            committedDate: "2026-10-01T02:00:00Z",
            messageHeadline: "Leave a note",
            oid: "ccc333",
            parentOid: "base000",
          },
        ],
      });
    }
    return Promise.resolve({
      items: [
        {
          abbreviatedOid: "aaa111",
          author: { login: "ada" },
          committedDate: "2026-10-01T00:00:00Z",
          messageHeadline: "Start the board",
          oid: "aaa111",
          parentOid: "base000",
        },
        {
          abbreviatedOid: "bbb222",
          author: { login: "ada" },
          committedDate: "2026-10-01T01:00:00Z",
          messageHeadline: "Rename the readme",
          oid: "bbb222",
          parentOid: "aaa111",
        },
      ],
    });
  }
  if (method === "tracker.pulls.thread" && Number(p.number) === 8) {
    return Promise.resolve({ baseRefName: "main", comments: [], headRefName: "notes", truncated: false });
  }
  if (method === "tracker.pulls.thread") {
    return Promise.resolve({
      baseRefName: "main",
      comments: [
        {
          author: { login: "ada" },
          body: "Looks like a shell.",
          createdAt: "2026-10-01T00:00:00Z",
          id: "r1",
          kind: "review",
          replies: [],
          state: "APPROVED",
          url: "https://github.com/orchestrai/demo/pull/7#pullrequestreview-1",
        },
        {
          author: { login: "ada" },
          body: "Name this.",
          createdAt: "2026-10-01T00:01:00Z",
          id: "c1", threadId: "th-name",
          kind: "review_comment",
          line: 2,
          path: "src/board.tsx",
          replies: [],
          url: "https://github.com/orchestrai/demo/pull/7#discussion_r1",
        },
        {
          author: { login: "linus" },
          body: "This moved.",
          createdAt: "2026-10-01T00:02:00Z",
          diffHunk: "@@ -1,2 +1,3 @@\n columns\n-shell\n+project shell",
          id: "c2",
          kind: "review_comment",
          originalLine: 4,
          threadId: "th-moved",
          path: "src/board.tsx",
          replies: [],
          url: "https://github.com/orchestrai/demo/pull/7#discussion_r2",
        },
      ],
      headRefName: "feat/shell",
      truncated: false,
    });
  }
  if (method === "tracker.pulls.checks") {
    if (Number(p.number) === 8) return Promise.resolve({ items: [] });
    return Promise.resolve({
      items: [
        {
          name: "ci / test",
          state: "passing",
          summary: "All tests passed",
          url: "https://github.com/orchestrai/demo/actions/runs/1",
        },
        {
          name: "ci / lint",
          state: "failing",
          summary: "Lint failed",
          url: "https://github.com/orchestrai/demo/actions/runs/2",
        },
      ],
    });
  }
  if (method === "memory.edges") return Promise.resolve([]);
  return null;
}
