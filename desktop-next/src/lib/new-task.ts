import type { ConfigOption, WorktreeBase } from "@warpforge/protocol";
import { create } from "zustand";

/** The backlog item a new task starts from; the task is linked to it once created. */
export interface DraftWorkItem {
  id: string;
  project: string;
  number: number;
}

/** A prompt, and optionally a Factory workflow or a backlog item, handed to the new-task dialog. Not persisted. */
export const useTaskDraft = create<{
  id: number;
  text: string;
  workflowId: string;
  workItem: DraftWorkItem | null;
  open: (text: string, workflowId?: string, workItem?: DraftWorkItem) => void;
}>((set) => ({
  id: 0,
  text: "",
  workflowId: "",
  workItem: null,
  open: (text, workflowId = "", workItem) =>
    set((state) => ({ id: state.id + 1, text, workflowId, workItem: workItem ?? null })),
}));

/** The item to link, only while the dialog still targets the item's project. */
export function linkedWorkItem(item: DraftWorkItem | null, project: string | undefined): string | null {
  return item && item.project === project ? item.id : null;
}

/** `""` starts from the checkout HEAD. `origin` tracks the remote default. */
export function worktreeBaseFrom(choice: string): WorktreeBase | undefined {
  if (!choice || choice === "head") return undefined;
  if (choice === "origin") return { kind: "origin" };
  return { kind: "existing", branch: choice };
}

function isModel(option: ConfigOption): boolean {
  return `${option.category ?? ""} ${option.id} ${option.name}`.toLowerCase().includes("model");
}

export function modelChoices(options: ConfigOption[]): { value: string; name: string }[] {
  return options.find(isModel)?.options ?? [];
}

/** The model sent as `default_model`, and every other pick as a session override. */
export function splitConfigPicks(
  options: ConfigOption[],
  picks: Record<string, string>,
): { model?: string; overrides: Record<string, string> } {
  const modelOption = options.find(isModel);
  const overrides: Record<string, string> = {};
  for (const option of options) {
    const value = picks[option.id] || option.currentValue;
    if (!value || option.id === modelOption?.id) continue;
    overrides[option.id] = value;
  }
  const model = modelOption ? picks[modelOption.id] || modelOption.currentValue || undefined : undefined;
  return { model, overrides };
}

/** Where this new task will run, in one sentence. */
export function runPlace(input: {
  mode: "single" | "orchestrator" | "factory";
  worktree: boolean;
  base: string;
  location: "default" | "worktree" | "checkout";
  tests: boolean;
}): string {
  if (input.mode === "orchestrator") return "Lead and workers share your current checkout.";
  if (input.mode === "factory") {
    const resolved = input.location === "default" ? (input.tests ? "checkout" : "worktree") : input.location;
    if (resolved === "checkout") {
      return input.location === "default" && input.tests
        ? "Runs in your project folder, because it tests the running app."
        : "Runs in your project folder, one Factory task at a time.";
    }
    return input.location === "default"
      ? "Runs in a background copy of the repository, side by side with other tasks."
      : "Runs in a background copy of the repository.";
  }
  if (!input.worktree) return "Runs in your current checkout.";
  if (input.base === "origin") return "Runs in an isolated worktree on a new branch from origin's latest.";
  if (input.base) return "Runs in an isolated worktree on this branch; pushes go to it.";
  return "Runs in an isolated git worktree.";
}
