import { toast } from "sonner";

import { openSettingsSection, type SectionId } from "../pages/settings/nav-store";
import { useAppearance } from "./appearance";
import { openComposerAttach } from "./composer-commands";
import { newChat } from "./quick-chat";
import { useShell, type ShellState } from "./shell-store";
import type { PaletteAction } from "./task-palette";
import { requestQuit } from "./use-quit";

/** One list for the palette and the shortcuts. */
export function openHome(): void {
  useShell.getState().openHome();
}

export function toggleNewTask(): void {
  useShell.getState().toggle("newTask");
}

export function toggleAddProject(): void {
  useShell.getState().toggle("adding");
}

/** Settings for the project in front, or the app-wide sections on Home or with no project open. */
export function openSettings(): void {
  const shell = useShell.getState();
  if (!shell.home && shell.project) shell.setPage("settings");
  else shell.openHomeSettings();
}

/** Opens Settings on one section, from wherever the app is. */
export function openSettingsAt(section: SectionId): void {
  const shell = useShell.getState();
  openSettingsSection(!shell.home && shell.project ? shell.project : null, section);
  openSettings();
}

export function closeCurrentProject(): void {
  const project = useShell.getState().project;
  if (project) useShell.getState().closeProject(project);
}

export function openActionsPalette(): void {
  useShell.getState().openPalette("actions");
}

export function toggleSidebar(): void {
  if (window.matchMedia("(max-width: 767px)").matches) {
    window.dispatchEvent(new Event("orc:toggle-mobile-sidebar"));
  } else {
    useShell.getState().toggle("sidebar");
  }
}

export function toggleFocus(): void {
  useShell.getState().toggle("focus");
}

export function toggleInspector(): void {
  useShell.getState().toggle("inspector");
}

export function toggleTerminal(): void {
  useShell.getState().toggle("terminal");
}

export function largerText(): void {
  useAppearance.getState().bumpText(1);
}

export function smallerText(): void {
  useAppearance.getState().bumpText(-1);
}

export function resetText(): void {
  useAppearance.getState().resetText();
}

export function attachFile(): void {
  openComposerAttach();
}

export function searchInFiles(): void {
  useShell.getState().setPage("files");
  window.setTimeout(() => document.getElementById("file-find")?.focus(), 0);
}

export function quitApp(): void {
  if (!requestQuit()) toast.info("Quit is available in the desktop window");
}

export function shellActions(shell: ShellState): PaletteAction[] {
  return [
    { id: "home", label: "Home ⌃1", run: openHome },
    { id: "new", label: "New task ⌘N", run: toggleNewTask },
    { id: "new-chat", label: "New chat ⇧⌘N", run: () => void newChat() },
    { id: "add", label: "Add project ⌘O", run: toggleAddProject },
    { id: "open-settings", label: "Settings ⌘,", run: openSettings },
    {
      id: "sidebar",
      label: shell.sidebar ? "Collapse sidebar ⌘\\" : "Expand sidebar ⌘\\",
      run: toggleSidebar,
    },
    {
      id: "focus",
      label: shell.focus ? "Leave focus ⇧⌘\\" : "Focus mode ⇧⌘\\",
      run: toggleFocus,
    },
    {
      id: "inspector",
      label: shell.inspector ? "Hide inspector ⌥⌘I" : "Show inspector ⌥⌘I",
      run: toggleInspector,
    },
    {
      id: "terminal",
      label: shell.terminal ? "Hide terminal ⌃`" : "Show terminal ⌃`",
      run: toggleTerminal,
    },
    { id: "font-up", label: "Larger text ⌘+", run: largerText },
    { id: "font-down", label: "Smaller text ⌘−", run: smallerText },
    { id: "font-reset", label: "Reset text size ⌘0", run: resetText },
    { id: "attach", label: "Attach a file ⌘⇧A", run: attachFile },
    { id: "attach-image", label: "Attach an image ⌘⇧I", run: attachFile },
    { id: "quit", label: "Quit ⌘Q", run: quitApp },
    { id: "find", label: "Search in files… ⌘⇧F", run: searchInFiles },
  ];
}
