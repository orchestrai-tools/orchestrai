export interface ChannelMention {
  id: string;
  name: string;
}

/** The `@word` being typed at the caret, if any. */
export function mentionQuery(value: string, caret: number): { start: number; text: string } | null {
  const match = /(^|\s)@([\w-]*)$/.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[2].length - 1, text: match[2].toLowerCase() };
}

export function mentionMatches(agents: ChannelMention[], query: string): ChannelMention[] {
  return agents
    .filter(
      (agent) =>
        agent.id.toLowerCase().startsWith(query) || agent.name.toLowerCase().startsWith(query),
    )
    .slice(0, 6);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ChannelPart = { kind: "text" | "mention"; text: string };

/** Mark `@agent` in a posted message when that agent is enabled. */
export function channelMentionParts(body: string, ids: string[]): ChannelPart[] {
  const known = [...new Set(ids.map((id) => id.toLowerCase()))].sort((a, b) => b.length - a.length);
  if (known.length === 0 || !body) return [{ kind: "text", text: body }];
  const pattern = new RegExp(`(^|\\s)@(${known.map(escapeRegExp).join("|")})(?![\\w-])`, "gi");
  const parts: ChannelPart[] = [];
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    const at = (match.index ?? 0) + match[1].length;
    if (at > cursor) parts.push({ kind: "text", text: body.slice(cursor, at) });
    const token = body.slice(at, at + match[2].length + 1);
    parts.push({ kind: "mention", text: token });
    cursor = at + token.length;
  }
  if (cursor < body.length) parts.push({ kind: "text", text: body.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: "text", text: body }];
}

export function applyMention(
  value: string,
  start: number,
  caret: number,
  id: string,
): { value: string; caret: number } {
  return {
    value: `${value.slice(0, start)}@${id} ${value.slice(caret)}`,
    caret: start + id.length + 2,
  };
}
