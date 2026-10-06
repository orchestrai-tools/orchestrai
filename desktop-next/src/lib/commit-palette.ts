import { useCommitAsk, type CommitAsk } from "./commit-ask";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

function ask(kind: CommitAsk): void {
  useShell.getState().setPage("changes");
  useCommitAsk.getState().ask(kind);
}

/** Draft, amend, shelf, and stash from the commit box. */
export function commitPaletteActions(): PaletteAction[] {
  return [
    { id: "draft-commit", label: "Draft commit message", run: () => ask("draft") },
    { id: "amend-commit", label: "Amend last commit", run: () => ask("amend") },
    { id: "shelf-staged", label: "Shelf staged changes", run: () => ask("shelf") },
    { id: "stash-staged", label: "Stash staged changes", run: () => ask("stash") },
  ];
}
