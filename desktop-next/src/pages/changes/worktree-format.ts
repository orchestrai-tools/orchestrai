export function worktreeConfirm(
  kind: "reclaim" | "remove",
  owned: boolean,
): { title: string; body: string; confirmLabel: string } {
  if (kind === "reclaim") {
    return {
      title: "Reclaim build artifacts?",
      body: "This deletes node_modules, target, and other build folders inside this worktree only. Source files stay; the next build recreates them.",
      confirmLabel: "Reclaim",
    };
  }
  return {
    title: "Remove this worktree?",
    body: owned
      ? "This archives the task and deletes its checkout and branch. It is refused while the checkout has uncommitted or unpushed work."
      : "This deletes the checkout and its task branch. It is refused while the checkout has uncommitted or unpushed work.",
    confirmLabel: "Remove",
  };
}

export function formatWorktreeSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
