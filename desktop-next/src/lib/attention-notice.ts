import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { needsPerson } from "../model/tasks";

export interface AttentionNotice {
  kind: "permission" | "review";
  taskId: string;
  requestId?: string;
  title: string;
  subtitle: string;
  body: string;
}

export type PermissionWire = "allow" | "allow_always" | "deny";

/** Map a button label to the outcome the daemon accepts. */
export function permissionOutcome(option: string): PermissionWire | null {
  const normalized = option.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "allow" || normalized === "allow_once" || normalized === "approve" || normalized === "approve_once") {
    return "allow";
  }
  if (normalized === "allow_always" || normalized === "always") return "allow_always";
  if (normalized === "deny" || normalized === "reject") return "deny";
  return null;
}

/**
 * What a native banner button should send. A site grant has no one-click
 * approve: it is answered in the task, where the site is named.
 */
export function bannerPermissionOutcome(
  action: string,
  options: readonly string[] | undefined,
  browserOrigin?: string,
): PermissionWire | null {
  if (action !== "approve" && action !== "reject") return null;
  if (action === "approve" && browserOrigin) return null;
  if (!options) return action === "approve" ? "allow" : "deny";
  const wanted = action === "approve" ? "allow" : "deny";
  return options.map(permissionOutcome).find((value) => value === wanted) ?? null;
}

export function attentionKey(notice: Pick<AttentionNotice, "kind" | "taskId" | "requestId">): string {
  return `${notice.kind}:${notice.taskId}:${notice.requestId ?? ""}`;
}

/** What changed between two sets of things waiting for a person. */
export function attentionDelta(previous: AttentionNotice[], next: AttentionNotice[]): {
  notify: AttentionNotice[];
  withdraw: Pick<AttentionNotice, "kind" | "taskId" | "requestId">[];
} {
  const before = new Map(previous.map((notice) => [attentionKey(notice), notice]));
  const after = new Set(next.map(attentionKey));
  return {
    notify: next.filter((notice) => !before.has(attentionKey(notice))),
    withdraw: previous.filter((notice) => !after.has(attentionKey(notice))),
  };
}

/** One native notice per task that needs a person. A live permission is named; anything else is a review. */
export function noticesFor(tasks: TaskInfo[], updates: Record<string, SessionUpdate[]>): AttentionNotice[] {
  return tasks.filter(needsPerson).map((task) => {
    const pending = [...(updates[task.id] ?? [])].reverse().find((update) => update.kind === "tool_call" && update.pendingPermission);
    if (pending && pending.kind === "tool_call" && pending.pendingPermission) {
      return {
        kind: "permission",
        taskId: task.id,
        requestId: pending.pendingPermission.request_id,
        title: task.title || "Permission",
        subtitle: task.project,
        body: pending.title,
      };
    }
    return {
      kind: "review",
      taskId: task.id,
      title: task.title || task.prompt,
      subtitle: task.project,
      body: task.blockedReason || "Waiting for you",
    };
  });
}
