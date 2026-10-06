import type { Memory, MemoryProposal } from "@warpforge/protocol";

export const MEMORY_KINDS = ["fact", "decision", "preference", "gotcha", "note"] as const;
export const MEMORY_RELATIONS = ["related", "supports", "contradicts", "supersedes"] as const;

export type ScopeFilter = "all" | "global" | "project";

export const PROPOSAL_LABEL: Record<string, string> = {
  contradiction: "Contradiction",
  delete: "Delete",
  duplicate: "Duplicate",
  merge: "Merge",
  stale: "Stale",
  superseded_by: "Superseded",
};

/** Split an FTS snippet. The daemon marks matches with `<b>…</b>`. */
export function splitSnippet(snippet: string): { at: number; text: string; match: boolean }[] {
  const runs: { at: number; text: string; match: boolean }[] = [];
  let at = 0;
  const push = (text: string, match: boolean) => {
    runs.push({ at, match, text });
    at += text.length;
  };
  let rest = snippet;
  while (rest) {
    const open = rest.indexOf("<b>");
    const close = open === -1 ? -1 : rest.indexOf("</b>", open + 3);
    if (open === -1 || close === -1) {
      push(rest, false);
      break;
    }
    if (open > 0) push(rest.slice(0, open), false);
    push(rest.slice(open + 3, close), true);
    rest = rest.slice(close + 4);
  }
  return runs;
}

export function proposalTargets(proposal: MemoryProposal): string[] {
  return (proposal.target_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function scopeLabel(memory: Pick<Memory, "scope">): string {
  return memory.scope.startsWith("project:") ? memory.scope.slice("project:".length) : "Global";
}

export function collectTags(memories: readonly Memory[]): string[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const tag of memory.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

export function proposalEffect(proposal: MemoryProposal): { applies: boolean; summary: string } {
  const count = proposalTargets(proposal).length;
  const noun = (n: number) => (n === 1 ? "memory" : "memories");
  switch (proposal.proposal_type) {
    case "duplicate":
      return {
        applies: count > 1,
        summary: `Approving keeps the oldest memory and deletes the other ${count - 1}.`,
      };
    case "stale":
    case "delete":
      return { applies: true, summary: `Approving deletes ${count} ${noun(count)}.` };
    default:
      return {
        applies: false,
        summary: "Approving only records your decision and changes nothing.",
      };
  }
}

export function filterMemories(
  rows: readonly Memory[],
  filter: { kind: string; tag: string; searching: boolean },
): Memory[] {
  return rows.filter(
    (row) =>
      (!filter.searching || filter.kind === "all" || row.kind === filter.kind) &&
      (!filter.tag || row.tags.includes(filter.tag)),
  );
}
