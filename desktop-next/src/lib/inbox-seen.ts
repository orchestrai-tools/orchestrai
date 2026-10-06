import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import { create } from "zustand";

const STORAGE_KEY = "wf-inbox-seen-v1";

/** Bumps when a pull request is marked read, so the list and the nav badge refresh. */
export const useInboxSeen = create<{ tick: number }>(() => ({ tick: 0 }));

function bumpSeen() {
  useInboxSeen.setState((state) => ({ tick: state.tick + 1 }));
}

function load(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const seen: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) seen[key] = value;
    }
    return seen;
  } catch {
    return {};
  }
}

function save(seen: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}

export function pullKey(pull: { repo: string; number: number }): string {
  return `${pull.repo}#${pull.number}`;
}

export function isUnseen(pull: { repo: string; number: number; updatedAt: number }): boolean {
  const seen = load();
  const key = pullKey(pull);
  return key in seen && seen[key] !== pull.updatedAt;
}

/** First sight of the list records every row so an empty install does not mark the whole inbox unseen. */
export function seedSeen(pulls: { repo: string; number: number; updatedAt: number }[]) {
  const seen = load();
  let changed = false;
  for (const pull of pulls) {
    const key = pullKey(pull);
    if (!(key in seen)) {
      seen[key] = pull.updatedAt;
      changed = true;
    }
  }
  if (changed) save(seen);
}

export function markSeen(pull: { repo: string; number: number; updatedAt: number }) {
  const seen = load();
  seen[pullKey(pull)] = pull.updatedAt;
  save(seen);
  bumpSeen();
}

export function markAllSeen(pulls: { repo: string; number: number; updatedAt: number }[]) {
  const seen = load();
  for (const pull of pulls) seen[pullKey(pull)] = pull.updatedAt;
  save(seen);
  bumpSeen();
}

/** Mark every open pull request in the project read, from the page or the palette. */
export function markProjectPullsRead(project: string) {
  void daemon
    .listPulls(project, { state: "open" })
    .then((rows) => {
      markAllSeen(rows);
      toast.success("Marked pull requests as read");
    })
    .catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not mark pull requests as read"),
    );
}
