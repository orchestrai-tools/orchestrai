import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import { revealPath } from "./reveal-path";
import { useShell } from "./shell-store";

/** The open editor's save and go-to-definition, so the palette can run them. */
const commands: { save: () => void; define: () => boolean } = {
  save: () => undefined,
  define: () => false,
};
let bound = false;

export function bindEditorCommands(next: { save: () => void; define: () => boolean } | null): void {
  bound = next != null;
  commands.save = next?.save ?? (() => undefined);
  commands.define = next?.define ?? (() => false);
}

export function editorCommands(): { save: () => void; define: () => boolean } | null {
  return bound ? commands : null;
}

/** File-toolbar actions the command palette runs by the same button. */
export const FILE_CHANGE_ACTIONS = [
  "Previous change",
  "Next change",
  "Revert this change",
  "Copy this change",
  "Revert to last commit",
] as const;

/** Files-page actions the palette runs through the page's own buttons. */
export function fileCreateActions(): { id: string; label: string; run: () => void }[] {
  return [
    { id: "new-file", label: "New file", run: () => createPath(false) },
    { id: "new-folder", label: "New folder", run: () => createPath(true) },
    { id: "preview-file", label: "Preview file", run: togglePreview },
    { id: "rename-file", label: "Rename file", run: renameFile },
    { id: "delete-file", label: "Delete file", run: deleteFile },
    { id: "close-tab", label: "Close tab", run: closeOpenTab },
    { id: "commit-file", label: "Commit this file", run: commitOpenFile },
    { id: "add-selection", label: "Add selection to chat", run: addSelection },
    { id: "copy-file-path", label: "Copy file path", run: () => copyOpenFile() },
    { id: "reveal-file", label: "Reveal in Finder", run: () => showOpenFile(true) },
    { id: "open-file-external", label: "Open in default app", run: () => showOpenFile(false) },
  ];
}

function activeTabClose(): Element | null {
  return document.querySelector('[data-file-tab][data-active="true"] button[aria-label^="Close "]');
}

function openTabPath(): string | null {
  const label = activeTabClose()?.getAttribute("aria-label") ?? "";
  return label.startsWith("Close ") ? label.slice("Close ".length) : null;
}

function copyOpenFile() {
  useShell.getState().setPage("files");
  const path = openTabPath();
  if (!path) {
    toast.error("Open a file first");
    return;
  }
  void navigator.clipboard.writeText(path).then(
    () => toast.success(`Copied ${path}`),
    () => toast.info(path),
  );
}

function showOpenFile(inDir: boolean) {
  useShell.getState().setPage("files");
  const path = openTabPath();
  if (!path) {
    toast.error("Open a file first");
    return;
  }
  const project = useShell.getState().project;
  const root = daemon.getState().snapshot.projects.find((item) => item.name === project)?.path;
  void revealPath(path, root, inDir);
}

function closeOpenTab() {
  useShell.getState().setPage("files");
  const close = activeTabClose();
  if (!(close instanceof HTMLButtonElement)) {
    toast.error("Open a file first");
    return;
  }
  close.click();
}

function commitOpenFile() {
  useShell.getState().setPage("files");
  const input = document.querySelector('input[aria-label="Commit this change"]');
  if (!(input instanceof HTMLInputElement)) {
    toast.error("Select a change first");
    return;
  }
  if (!input.value.trim()) {
    input.focus();
    toast.info("Write a commit message first");
    return;
  }
  const commit = input.nextElementSibling;
  if (!(commit instanceof HTMLButtonElement) || commit.disabled) {
    toast.error("Open a file with changes first");
    return;
  }
  commit.click();
}

function addSelection() {
  useShell.getState().setPage("files");
  if (!runLabeledButton("Add selection to chat")) toast.error("Open a file first");
}

function renameFile() {
  useShell.getState().setPage("files");
  if (!runLabeledButton("Rename…")) toast.error("Open a file first");
}

function deleteFile() {
  useShell.getState().setPage("files");
  if (!runLabeledButton("Delete…")) toast.error("Open a file first");
}

function togglePreview() {
  useShell.getState().setPage("files");
  if (runLabeledButton("Preview") || runLabeledButton("Edit")) return;
  toast.error("Open a markdown, HTML, or SVG file first");
}

function createPath(directory: boolean) {
  useShell.getState().setPage("files");
  if (!runLabeledButton(directory ? "New folder…" : "New file…")) toast.error("Open a project first");
}

/** Click a toolbar button by its visible label. */
export function runLabeledButton(label: string): boolean {
  if (typeof document === "undefined") return false;
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) return false;
  button.click();
  return true;
}
