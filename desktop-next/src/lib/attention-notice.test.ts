import { describe, expect, it } from "vitest";
import type { TaskInfo } from "@warpforge/protocol";
import { attentionDelta, bannerPermissionOutcome, noticesFor, permissionOutcome } from "./attention-notice";

function task(partial: Partial<TaskInfo> & Pick<TaskInfo, "id">): TaskInfo {
  return {
    project: "app",
    prompt: "do the thing",
    title: "Thing",
    agent: "claude",
    status: "waiting",
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    tags: [],
    ...partial,
  } as TaskInfo;
}

describe("attention notices", () => {
  it("notifies a new permission and withdraws it once the task no longer needs a person", () => {
    const waiting = task({ id: "t1", pendingPermission: true });
    const next = noticesFor([waiting], {
      t1: [{ kind: "tool_call", tool_call_id: "c", title: "Run tests", status: "pending", tool_kind: "execute", pendingPermission: { request_id: "r1", options: ["allow", "reject"] } }],
    });
    expect(next[0]?.kind).toBe("permission");
    expect(next[0]?.requestId).toBe("r1");
    const first = attentionDelta([], next);
    expect(first.notify).toHaveLength(1);
    expect(first.withdraw).toHaveLength(0);
    const cleared = attentionDelta(next, []);
    expect(cleared.withdraw.map((item) => item.taskId)).toEqual(["t1"]);
    expect(cleared.notify).toHaveLength(0);
  });
});

describe("permission outcomes", () => {
  it("maps banner and button labels onto allow, allow always, and deny", () => {
    expect(permissionOutcome("Allow once")).toBe("allow");
    expect(permissionOutcome("reject")).toBe("deny");
    expect(permissionOutcome("allow always")).toBe("allow_always");
    expect(bannerPermissionOutcome("approve", ["allow", "deny"])).toBe("allow");
    expect(bannerPermissionOutcome("reject", ["allow", "deny"])).toBe("deny");
    expect(bannerPermissionOutcome("approve", ["allow"], "https://example.com")).toBeNull();
    expect(bannerPermissionOutcome("approve", undefined)).toBe("allow");
  });
});
