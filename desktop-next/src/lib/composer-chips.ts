import type { FileDiff, PromptAttachment } from "@warpforge/protocol";
import { create } from "zustand";
import { toast } from "sonner";
import { formatFileDiff } from "./file-patch";
import { useShell } from "./shell-store";
import { deliverToConversation } from "./composer-insert";

export interface DiffChip {
  id: string;
  path: string;
  status: string;
  added: number;
  removed: number;
  content: string;
}

export interface ContextChip {
  id: string;
  label: string;
  body: string;
  image?: { name: string; data: string };
}

interface ComposerChips {
  diffs: DiffChip[];
  contexts: ContextChip[];
  add: (chip: DiffChip) => void;
  addContext: (chip: ContextChip) => void;
  setImage: (id: string, image: { name: string; data: string }) => void;
  remove: (id: string) => void;
  take: () => { diffs: DiffChip[]; contexts: ContextChip[] };
}

export const useComposerChips = create<ComposerChips>((set, get) => ({
  diffs: [],
  contexts: [],
  add: (chip) => set((state) => ({ diffs: [...state.diffs, chip] })),
  addContext: (chip) => set((state) => ({ contexts: [...state.contexts, chip] })),
  setImage: (id, image) =>
    set((state) => ({
      contexts: state.contexts.map((chip) => (chip.id === id ? { ...chip, image } : chip)),
    })),
  remove: (id) =>
    set((state) => ({
      diffs: state.diffs.filter((chip) => chip.id !== id),
      contexts: state.contexts.filter((chip) => chip.id !== id),
    })),
  take: () => {
    const pending = { diffs: get().diffs, contexts: get().contexts };
    set({ diffs: [], contexts: [] });
    return pending;
  },
}));

export function diffCounts(file: FileDiff): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) added += 1;
      else if (line.startsWith("-")) removed += 1;
    }
  }
  return { added, removed };
}

/** Keep a file diff on the composer until it is sent or removed. */
export function attachFileDiff(project: string, file: FileDiff): void {
  const shell = useShell.getState();
  const content = formatFileDiff(file);
  if (!shell.taskId || shell.project !== project) {
    deliverToConversation(project, content);
    return;
  }
  const counts = diffCounts(file);
  useComposerChips.getState().add({
    id: `${file.path}#${Date.now()}`,
    path: file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path,
    status: file.status,
    added: counts.added,
    removed: counts.removed,
    content,
  });
  shell.setTaskTab("conversation");
  shell.setPage("task");
  toast.success("Added to the conversation");
}

/** Keep a log or other note on the composer until it is sent or removed. */
export function attachContext(project: string, label: string, body: string): string | null {
  const shell = useShell.getState();
  if (!shell.taskId || shell.project !== project) {
    deliverToConversation(project, `${label}\n\n${body}`);
    return null;
  }
  const id = `${label}#${Date.now()}`;
  useComposerChips.getState().addContext({ id, label, body });
  shell.setTaskTab("conversation");
  shell.setPage("task");
  toast.success("Added to the conversation");
  return id;
}

/** Fill a screenshot into a chip that is still waiting to be sent. */
export function setContextImage(id: string, image: { name: string; data: string }): void {
  useComposerChips.getState().setImage(id, image);
}

/** Screenshots riding along with context chips. */
export function contextImages(contexts: ContextChip[]): PromptAttachment[] {
  return contexts.flatMap((chip) =>
    chip.image
      ? [
          {
            type: "image" as const,
            name: chip.image.name,
            mimeType: "image/png" as const,
            data: chip.image.data,
          },
        ]
      : [],
  );
}

/** The reply, then each diff, then each attached note. */
export function messageWithChips(text: string, diffs: DiffChip[], contexts: ContextChip[]): string {
  const parts = [
    text.trim(),
    ...diffs.map((diff) => `\`\`\`diff\n${diff.content}\n\`\`\``),
    ...contexts.map((chip) => chip.body),
  ].filter(Boolean);
  return parts.join("\n\n");
}
