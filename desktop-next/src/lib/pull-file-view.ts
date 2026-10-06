/** How a pull request's files are shown. Shared with the previous app's key. */
export type PullFileView = "list" | "groups" | "tree";

const KEY = "wf-pull-files-view";

export function readPullFileView(): PullFileView {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "list" || value === "groups" || value === "tree") return value;
  } catch {
    // A blocked store just starts on the list.
  }
  return "list";
}

export function writePullFileView(view: PullFileView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // The choice still applies for this visit.
  }
}
