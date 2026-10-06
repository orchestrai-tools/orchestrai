import { toast } from "sonner";
import { useShell } from "./shell-store";

/** The open composer's file picker, so the palette can attach without focus. */
let attach: (() => void) | null = null;

export function bindComposerCommands(next: { attach: () => void } | null): void {
  attach = next?.attach ?? null;
}

export function composerCommands(): { attach: () => void } | null {
  return attach ? { attach } : null;
}

/** Open the conversation, then the file picker. */
export function openComposerAttach(): void {
  const shell = useShell.getState();
  if (!shell.taskId) {
    toast.info("Open a task before attaching a file");
    return;
  }
  shell.setPage("task");
  shell.setTaskTab("conversation");
  const clickWhenBound = (tries: number) => {
    if (attach) {
      attach();
      return;
    }
    if (tries <= 0) {
      toast.error("Open the conversation to attach a file");
      return;
    }
    window.setTimeout(() => clickWhenBound(tries - 1), 30);
  };
  window.setTimeout(() => clickWhenBound(8), 0);
}
