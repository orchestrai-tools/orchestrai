import type { Memory, MemoryProposal } from "@/protocol";

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

/**
 * Split an FTS snippet into plain and highlighted runs. The daemon marks
 * matches with `<b>…</b>`; rendering the runs as text keeps stored content from
 * ever being interpreted as markup.
 *
 * @param snippet The snippet as the daemon returned it.
 * @returns Consecutive runs with their offset, each flagged when it was a match.
 */
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

/**
 * The memory ids a dreaming proposal points at.
 *
 * @param proposal A proposal from the compaction log.
 * @returns Its target ids, trimmed, in the order the daemon stored them.
 */
export function proposalTargets(proposal: MemoryProposal): string[] {
  return (proposal.target_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Where a memory lives, for display.
 *
 * @param memory The memory.
 * @returns "Global", or the project id for a project-scoped memory.
 */
export function scopeLabel(memory: Pick<Memory, "scope">): string {
  return memory.scope.startsWith("project:") ? memory.scope.slice("project:".length) : "Global";
}

/**
 * The tags used across a set of memories, most common first.
 *
 * @param memories The memories to scan.
 * @returns Distinct tags ordered by how many memories carry them.
 */
export function collectTags(memories: readonly Memory[]): string[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const tag of memory.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

/**
 * What approving a proposal does. Mirrors the daemon: it deletes for
 * `duplicate` (all but the oldest), `stale` and `delete`, and only records the
 * decision for every other kind.
 *
 * @param proposal A proposal from the compaction log.
 * @returns Whether approval changes memories, and a sentence saying how.
 */
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
        summary:
          "Approving only records your decision and changes nothing. Open the memories to merge or edit them yourself.",
      };
  }
}

/**
 * The memory an approved `duplicate` proposal keeps: the oldest target.
 *
 * @param proposal A proposal from the compaction log.
 * @param known Memories by id; targets missing from it are ignored.
 * @returns The id that survives, or null for other kinds or when none are known.
 */
export function keptDuplicateId(
  proposal: MemoryProposal,
  known: ReadonlyMap<string, Memory>,
): string | null {
  if (proposal.proposal_type !== "duplicate") return null;
  const found = proposalTargets(proposal)
    .map((id) => known.get(id))
    .filter((m): m is Memory => !!m)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return found[0]?.id ?? null;
}

/**
 * Whether an approved proposal still has deletions waiting: an agent recorded
 * its approval but nobody applied it, and the targets it names still exist.
 *
 * @param proposal A proposal from the compaction log.
 * @param known Memories by id.
 * @returns True when applying it now would delete something.
 */
export function awaitsApply(proposal: MemoryProposal, known: ReadonlyMap<string, Memory>): boolean {
  if (proposal.status !== "applied") return false;
  const left = proposalTargets(proposal).filter((id) => known.has(id)).length;
  switch (proposal.proposal_type) {
    case "duplicate":
      return left > 1;
    case "stale":
    case "delete":
      return left > 0;
    default:
      return false;
  }
}
