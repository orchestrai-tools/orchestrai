/** Copy for the task-history cleanup notices. */
export function historyPrunedMessage(updates: number): string {
  return `Removed ${updates} stored message${updates === 1 ? "" : "s"} from finished tasks older than your retention window.`;
}

export function historySweptMessage(counts: {
  settled: number;
  expired: number;
  kept: number;
}): string | null {
  const parts: string[] = [];
  if (counts.settled > 0) {
    parts.push(
      `Settled ${counts.settled} ignored task${counts.settled === 1 ? "" : "s"} with no changes`,
    );
  }
  if (counts.expired > 0) {
    parts.push(
      `Deleted ${counts.expired} closed task${counts.expired === 1 ? "" : "s"} past your retention window`,
    );
  }
  if (counts.kept > 0) parts.push(`Kept ${counts.kept} with unmerged changes`);
  return parts.length > 0 ? `${parts.join(". ")}. Tune this in Settings, Task history.` : null;
}

/** What a finished task does when nobody touches it. */
export function taskLifecycle(settle: number, keep: number, remove: number): string {
  const parts = [
    settle ? `settles after ${settle} days` : "never settles on its own",
    keep ? `loses its chat after ${keep} days` : "keeps its chat forever",
    remove ? `is deleted after ${remove} days` : "is never deleted",
  ];
  return `Left alone, a finished task ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}
