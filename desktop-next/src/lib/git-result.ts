import type { GitOpResult } from "@warpforge/protocol";
import { toast } from "sonner";

export function describeGitResult(result: GitOpResult): {
  level: "success" | "info" | "error";
  message: string;
  detail?: string;
} {
  if (result.status === "ok") return { level: "success", message: result.message };
  if (result.status === "up_to_date") return { level: "info", message: result.message };
  const detail =
    result.status === "conflict" && result.conflicts.length > 0
      ? result.conflicts.join(", ")
      : undefined;
  return { level: "error", message: result.message, detail };
}

/** The last line of a git failure, with the full log kept when it is longer. */
export function gitFailureNotice(
  title: string,
  cause: unknown,
): { title: string; description: string; copy?: string } {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const lines = detail.split("\n").filter((line) => line.trim().length > 0);
  const last = lines[lines.length - 1]?.trim() ?? detail;
  const description = last.length > 200 ? `${last.slice(0, 200)}…` : last;
  return { title, description, copy: description === detail ? undefined : detail };
}

/** Show a git failure as its last line, and offer Copy when the log is longer. */
export function reportGitFailure(title: string, cause: unknown): void {
  const notice = gitFailureNotice(title, cause);
  toast.error(notice.title, {
    description: notice.description,
    duration: 10_000,
    action: notice.copy
      ? { label: "Copy", onClick: () => void navigator.clipboard.writeText(notice.copy ?? "") }
      : undefined,
  });
}

/** A resolved git call, as opposed to a pull request or another payload. */
export function isGitOpResult(value: unknown): value is GitOpResult {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "ok" || status === "up_to_date" || status === "conflict" || status === "error";
}

/** True when a remote-tracking ref already uses this branch name, e.g. `origin/main`. */
export function remoteNameTaken(remotes: string[], name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return remotes.some((ref) => ref.split("/").slice(1).join("/") === trimmed);
}
