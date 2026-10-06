import { daemon } from "@warpforge/daemon";

export const TRACKER_SYNCED_EVENT = "orc-tracker-synced";

export interface TrackerSyncResult {
  imported: number;
  updated: number;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What one Sync did, as a toast. */
export function trackerSyncMessage({ imported, updated }: TrackerSyncResult): string {
  if (!imported && !updated) return "Tracker items are up to date";
  const parts = [
    imported ? `imported ${plural(imported, "new issue")}` : "",
    updated ? `refreshed ${plural(updated, "item")}` : "",
  ];
  const text = parts.filter(Boolean).join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * With `ids`, refreshes only those linked items. Without, imports the project's
 * new GitHub and Linear issues and refreshes every link. A failed refresh does
 * not hide a successful import: the import is the part that brings rows in.
 */
export async function syncTrackers(
  project: string,
  ids: string[] = [],
): Promise<TrackerSyncResult> {
  const result = ids.length ? await refreshLinked(ids) : await importAndRefresh(project);
  window.dispatchEvent(new CustomEvent(TRACKER_SYNCED_EVENT, { detail: project }));
  return result;
}

async function refreshLinked(ids: string[]): Promise<TrackerSyncResult> {
  const rows = await daemon.syncExternalWorkItems(ids);
  return { imported: 0, updated: rows.length };
}

async function importAndRefresh(project: string): Promise<TrackerSyncResult> {
  const [imported, synced] = await Promise.all([
    daemon.importExternalWorkItems(project),
    daemon.syncExternalWorkItems([]).catch(() => []),
  ]);
  const moved = new Set([...imported.synced, ...synced].map((row) => row.id));
  return { imported: imported.items.length, updated: moved.size };
}
