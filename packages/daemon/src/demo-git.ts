/** Demo answers for worktrees, shelves, stashes, and branches. */
export function demoGitFixture(method: string): Promise<unknown> | null {
  if (method === "worktree.list") {
    return Promise.resolve({
      worktrees: [
        {
          branch: "feat/shell",
          hasSetupLog: true,
          orphan: false,
          path: "/demo/feat-shell",
          sizeBytes: 48 * 1024 * 1024,
          taskId: "demo-task",
          taskTitle: "Sketch the shell",
        },
      ],
    });
  }
  if (method === "worktree.setupLog") return Promise.resolve({ log: "Installed dependencies." });
  if (method === "shelf.list") {
    return Promise.resolve({
      entries: [
        {
          branch: "feat/shell",
          createdAt: 1_700_000_000,
          deletedFiles: [],
          files: ["README.md"],
          id: "shelf-1",
          name: "Keep the board sketch",
        },
      ],
    });
  }
  if (method === "stash.list") {
    return Promise.resolve({
      entries: [
        {
          branch: "feat/shell",
          createdAt: 1_700_000_100,
          files: ["README.md"],
          id: "stash@{0}",
          message: "WIP before the column",
        },
      ],
    });
  }
  if (method === "stash.get") {
    return Promise.resolve({
      entry: {
        branch: "feat/shell",
        createdAt: 1_700_000_100,
        files: ["README.md"],
        id: "stash@{0}",
        message: "WIP before the column",
      },
      files: [
        {
          hunks: [
            {
              lines: ["-old", "+Keep the column names."],
              newLines: 1,
              newStart: 1,
              oldLines: 1,
              oldStart: 1,
              resolution: null,
            },
          ],
          oldPath: null,
          path: "README.md",
          status: "modified",
        },
      ],
    });
  }
  if (method === "shelf.get") {
    return Promise.resolve({
      entry: {
        branch: "feat/shell",
        createdAt: 1_700_000_000,
        deletedFiles: [],
        files: ["README.md"],
        id: "shelf-1",
        name: "Keep the board sketch",
      },
      files: [
        {
          hunks: [
            {
              lines: ["-old", "+The board is a project shell."],
              newLines: 1,
              newStart: 1,
              oldLines: 1,
              oldStart: 1,
              resolution: null,
            },
          ],
          oldPath: null,
          path: "README.md",
          status: "modified",
        },
      ],
    });
  }
  if (method === "worktree.reclaim") return Promise.resolve({ freedBytes: 12 * 1024 * 1024 });
  if (method === "git.roots") {
    return Promise.resolve({
      roots: [
        { branch: "main", name: "demo", path: "/demo", remotes: ["origin"] },
        { branch: "feat/shell", name: "packages/ui", path: "/demo/packages/ui", remotes: [] },
      ],
    });
  }
  if (method === "git.ignored") {
    return Promise.resolve({
      available: true,
      ignored: ["node_modules/", ".env"],
      truncated: false,
    });
  }
  if (method === "git.branches") {
    return Promise.resolve({
      current: "main",
      branches: ["main", "feat/shell", "feat/column", "fix/diff-scroll", "release"],
      remotes: ["origin/main", "origin/feat/shell", "origin/fix/diff-scroll"],
    });
  }
  return null;
}
