import type { SessionUpdate } from "@warpforge/protocol";

/**
 * Close the tool calls a turn left open. Nothing runs after its turn ends, so a
 * call still marked running there only lost its final frame; without this its
 * spinner never stops.
 * @param output Coalesced updates, ending with the turn that just ended.
 * @param stopReason The ended turn's stop reason; only `end_turn` counts as success.
 */
export function settleTurnToolCalls(output: SessionUpdate[], stopReason: string): void {
  const status = stopReason === "end_turn" ? "completed" : "failed";
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const update = output[index];
    if (update.kind === "turn_ended") return;
    if (
      update.kind === "tool_call" &&
      (update.status === "pending" || update.status === "in_progress")
    ) {
      output[index] = { ...update, status };
    }
  }
}
