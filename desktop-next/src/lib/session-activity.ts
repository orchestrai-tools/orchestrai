import { toolDisplayTitle } from "@warpforge/core/toolDisplay";
import type { SessionUpdate } from "@warpforge/protocol";

export interface SessionActivity {
  label: string;
  detail: string;
  tone: "thinking" | "working" | "writing";
}

/** What a running agent is doing right now, from the newest session update. */
export function sessionActivity(updates: SessionUpdate[]): SessionActivity | null {
  if (pendingPermission(updates)) return null;
  const visible = updates.filter((update) => update.kind !== "available_commands" && update.kind !== "permission_resolved");
  const last = visible[visible.length - 1];
  if (!last) return { detail: "starting the agent session", label: "warming up", tone: "thinking" };
  if (last.kind === "turn_ended" || last.kind === "permission_request") return null;

  if (last.kind === "tool_call" && (last.status === "pending" || last.status === "in_progress")) {
    return {
      detail: toolDisplayTitle(last),
      label: last.tool_kind === "execute" ? "forging" : "working",
      tone: "working",
    };
  }

  switch (last.kind) {
    case "user_message":
      return { detail: "reading your instruction", label: "thinking", tone: "thinking" };
    case "agent_thought":
      return { detail: "planning the next move", label: "thinking", tone: "thinking" };
    case "agent_text":
      return { detail: "streaming a response", label: "writing", tone: "writing" };
    case "tool_call":
      return {
        detail: last.status === "failed" ? "checking the failed tool call" : "checking tool output",
        label: last.status === "failed" ? "recovering" : "warping",
        tone: "working",
      };
    case "file_edit":
      return { detail: `updated ${last.path.split("/").pop() || last.path}`, label: "forging", tone: "working" };
    case "plan":
      return { detail: "updating the plan", label: "mapping", tone: "thinking" };
    case "advisor_consultation":
      return { detail: "weighing the advisor's answer", label: "thinking", tone: "thinking" };
    default:
      return { detail: "waiting for the next update", label: "working", tone: "working" };
  }
}

function pendingPermission(updates: SessionUpdate[]): boolean {
  const resolved = new Set<string>();
  for (const update of updates) {
    if (update.kind === "permission_resolved") resolved.add(update.request_id);
  }
  return updates.some((update) => update.kind === "permission_request" && !resolved.has(update.request_id));
}
