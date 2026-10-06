import type { CommandInfo, SessionUpdate } from "@warpforge/protocol";

/** The commands the agent last advertised for this conversation. */
export function latestCommands(updates: SessionUpdate[]): CommandInfo[] {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update.kind === "available_commands") return update.commands;
  }
  return [];
}
