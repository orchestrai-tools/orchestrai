import type { SessionUpdate } from "@warpforge/protocol";

/**
 * The thought that is still arriving. A later answer or a new user message
 * ends it. Tool calls in between do not.
 */
export function activeThinkingIndex(updates: SessionUpdate[], running: boolean): number | null {
  if (!running) return null;
  let lastThought: number | null = null;
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    if (updates[index].kind === "agent_thought") {
      lastThought = index;
      break;
    }
  }
  if (lastThought === null) return null;
  for (let index = lastThought + 1; index < updates.length; index += 1) {
    const kind = updates[index].kind;
    if (kind === "agent_text" || kind === "user_message") return null;
  }
  return lastThought;
}
