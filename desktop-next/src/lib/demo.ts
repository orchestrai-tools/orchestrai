import { daemon } from "@warpforge/daemon";
import { EMPTY_SNAPSHOT, type FileDoc, type TaskDiff, type TaskInfo } from "@warpforge/protocol";

const factoryTask: TaskInfo = {
  id: "demo-factory",
  project: "demo",
  prompt: "Queue the column",
  agent: "claude",
  status: "queued",
  tags: ["runner"],
  title: "Queue the column",
  createdAt: Math.floor(Date.now() / 1000) - 60,
  updatedAt: Math.floor(Date.now() / 1000) - 30,
  filesChanged: 0,
  blockedReason: null,
};

const doneTask: TaskInfo = {
  id: "demo-done",
  project: "demo",
  prompt: "Land the first column",
  agent: "claude",
  status: "done",
  tags: [],
  title: "Land the first column",
  createdAt: Math.floor(Date.now() / 1000) - 3600,
  updatedAt: Math.floor(Date.now() / 1000) - 1800,
  filesChanged: 0,
  blockedReason: null,
  workflowRun: {
    maxRounds: 3,
    report: null,
    round: 1,
    stage: "done",
    verdict: "approve",
    verifications: [
      {
        attempt: 1,
        checklist: [
          {
            evidence: ["board.png"],
            note: "Columns are visible",
            status: "pass",
            step: "Open the board",
          },
        ],
        evidence: [{ mimeType: "image/png", name: "board.png", path: "board.png" }],
        summary: "The board renders.",
        verdict: "pass",
      },
    ],
    waiting: null,
    workflowId: "review-loop",
    workflowName: "Implement + review loop",
  },
};

const mergedTask: TaskInfo = {
  id: "demo-merged",
  project: "demo",
  prompt: "Ship the column",
  agent: "claude",
  status: "done",
  tags: [],
  title: "Ship the column",
  createdAt: Math.floor(Date.now() / 1000) - 7200,
  updatedAt: Math.floor(Date.now() / 1000) - 3600,
  filesChanged: 0,
  blockedReason: null,
  worktree: "feat/column",
};

const advisorTask: TaskInfo = {
  id: "demo-advisor",
  project: "demo",
  prompt: "Advise on the shell",
  agent: "codex",
  status: "done",
  tags: [],
  title: "Advisor on the shell",
  origin: "advisor",
  parentTaskId: "demo-task",
  createdAt: Math.floor(Date.now() / 1000) - 90,
  updatedAt: Math.floor(Date.now() / 1000) - 40,
  filesChanged: 0,
  blockedReason: null,
};

const liveTask: TaskInfo = {
  id: "demo-live",
  project: "demo",
  prompt: "Watch the columns",
  agent: "claude",
  status: "running",
  tags: [],
  title: "Watch the columns",
  createdAt: Math.floor(Date.now() / 1000) - 20,
  updatedAt: Math.floor(Date.now() / 1000) - 5,
  filesChanged: 0,
  blockedReason: null,
};

const chatTask: TaskInfo = {
  id: "demo-chat",
  project: "demo",
  prompt: "How do services get their ports?",
  agent: "codex",
  status: "waiting",
  tags: [],
  title: "How services get their ports",
  origin: "chat",
  createdAt: Math.floor(Date.now() / 1000) - 600,
  updatedAt: Math.floor(Date.now() / 1000) - 540,
  filesChanged: 0,
  blockedReason: null,
};

const task: TaskInfo = {
  id: "demo-task",
  project: "demo",
  prompt: "Sketch the project-first shell",
  agent: "claude",
  status: "waiting",
  tags: [],
  title: "Sketch the shell",
  createdAt: Math.floor(Date.now() / 1000) - 120,
  updatedAt: Math.floor(Date.now() / 1000) - 30,
  filesChanged: 1,
  blockedReason: "Needs permission to edit README.md",
  worktree: "feat/shell",
  pendingPermission: true,
  advisor: { agent: "codex", consultations: 1, taskId: "demo-advisor" },
  queuedPrompts: [
    { id: "q1", initiator: "user", text: "Also rename the sidebar." },
    {
      attachments: [{ type: "file", path: "README.md" }],
      id: "q2",
      initiator: "automation",
      text: "Nightly check of the board.",
    },
  ],
};

/** `?demo` paints the shell with no daemon. */
export function bootDemo() {
  const diff: TaskDiff = {
    taskId: task.id,
    files: [
      {
        path: "src/app.tsx",
        oldPath: null,
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ["-shell", "+project shell"],
            resolution: null,
          },
        ],
      },
      {
        path: "README.md",
        oldPath: null,
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ["-old", "+The board is a project shell."],
            resolution: null,
          },
        ],
      },
      {
        path: "packages/ui/button.tsx",
        oldPath: null,
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ["-Button", "+Icon button"],
            resolution: null,
          },
        ],
      },
      {
        path: "index.html",
        oldPath: null,
        status: "added",
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 2,
            lines: ["+<h1>Board</h1>", "+<p>Columns are visible.</p>"],
            resolution: null,
          },
        ],
      },
      {
        path: "notes.md",
        oldPath: null,
        status: "added",
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            lines: ["+A note that is not in git yet."],
            resolution: null,
          },
        ],
      },
    ],
    untrackedPaths: ["notes.md"],
    untrackedAvailable: true,
    ignored: [],
    ignoredTruncated: false,
    ignoredAvailable: true,
    branch: "feat/shell",
  };
  const doc: FileDoc = { path: "README.md", status: "modified", oldText: "", newText: "demo" };
  daemon.enableDemoMode({
    snapshot: {
      ...EMPTY_SNAPSHOT,
      projects: [
        {
          name: "demo",
          path: "/demo",
          portRange: [4000, 4099],
          declaredServices: [],
          agentTemplates: {},
        },
      ],
      services: [
        {
          allocatedPort: 4000,
          command: "bun run dev",
          logSeq: 3,
          name: "web",
          originalPort: 5174,
          project: "demo",
          portPinned: true,
          local: true,
          localFields: ["command"],
          status: "running",
        },
      ],
      tasks: [task, factoryTask, doneTask, mergedTask, advisorTask, liveTask, chatTask],
      terminals: [
        {
          id: "demo-term",
          project: "demo",
          command: "bun run dev",
          startedAt: Math.floor(Date.now() / 1000) - 120,
          cols: 80,
          rows: 24,
        },
      ],
      agents: [
        { id: "claude", displayName: "Claude", acpCommand: "claude", enabled: true, models: [] },
      ],
      accounts: [
        {
          id: "claude:work",
          agentId: "claude",
          label: "Work",
          email: "ada@example.com",
          plan: "Max",
          active: true,
        },
        { id: "claude:personal", agentId: "claude", label: "Personal", plan: "Pro", active: false },
      ],
    },
    sessionUpdates: {
      [task.id]: [
        { kind: "user_message", text: task.prompt },
        {
          kind: "tool_call",
          tool_call_id: "edit-readme",
          title: "Edit README.md",
          status: "pending",
          tool_kind: "edit",
          pendingPermission: {
            request_id: "demo-permission",
            options: ["allow", "allow_always", "reject"],
          },
        },
      ],
      [liveTask.id]: [
        {
          kind: "tool_call",
          tool_call_id: "read-1",
          title: "Read README.md",
          status: "completed",
          tool_kind: "read",
          content: "Columns are visible.",
        },
        {
          kind: "tool_call",
          tool_call_id: "read-2",
          title: "Read app.tsx",
          status: "in_progress",
          tool_kind: "read",
        },
        {
          kind: "file_edit",
          path: "README.md",
          additions: 2,
          deletions: 0,
          tool_call_id: "edit-1",
        },
        {
          kind: "plan",
          entries: [
            { content: "Keep the columns", status: "completed" },
            { content: "Name the running card", status: "in_progress" },
            { content: "Open the file from the edit", status: "pending" },
          ],
        },
        { kind: "agent_thought", text: "The columns should stay." },
      ],
      [advisorTask.id]: [{ kind: "agent_text", text: "Keep the board as columns." }],
      [chatTask.id]: [
        { kind: "user_message", text: "How do services get their ports?" },
        {
          kind: "agent_text",
          text: "Each project gets its own block of 100 ports from 4000 up, and `${svc.port}` in the workspace file expands to the port picked for that service.",
        },
      ],
    },
    diffFor: () => diff,
    fileDocFor: (filePath) => {
      if (filePath === "package.json")
        return {
          path: filePath,
          status: "modified",
          oldText: "",
          newText: '{"scripts":{"dev":"vite","test":"vitest"}}\n',
        };
      if (filePath === "src/app.tsx")
        return {
          path: filePath,
          status: "modified",
          oldText: "shell\n",
          newText: "project shell\n",
        };
      if (filePath.endsWith(".html") || filePath.endsWith(".htm")) {
        return {
          path: filePath,
          status: "added",
          oldText: "",
          newText: "<h1>Board</h1>\n<p>Columns are visible.</p>\n",
        };
      }
      if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
        return {
          path: filePath,
          status: "modified",
          oldText: "# Board\n",
          newText: "# Board\n\nColumns are visible.\n",
        };
      }
      return { ...doc, path: filePath };
    },
  });
}
