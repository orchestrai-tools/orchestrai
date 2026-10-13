import type { TaskInfo } from "@warpforge/protocol";
import { toast } from "sonner";

import { contextImages, messageWithChips, useComposerChips } from "./composer-chips";
import { extractFileReferences, splitFileReference } from "./mention-path";
import { usePromptDrafts } from "./prompt-drafts";
import type { usePromptAttachments } from "./use-prompt-attachments";
import { deliverComposerMessage, workflowDelivery } from "./workflow-send";

/** A send belongs to the task, including while its page is closed. */
export function useComposerSend(
  task: TaskInfo,
  known: ReadonlySet<string>,
  uploads: ReturnType<typeof usePromptAttachments>,
) {
  const sending = usePromptDrafts((state) => Boolean(state.sending[task.id]));
  const capturing = useComposerChips((state) =>
    state.contexts.some((chip) => chip.taskId === task.id && chip.pendingImage),
  );
  async function send() {
    if (workflowDelivery(task).kind === "blocked" || uploads.reading) return;
    if (
      useComposerChips
        .getState()
        .contexts.some((chip) => chip.taskId === task.id && chip.pendingImage)
    )
      return;
    const store = usePromptDrafts.getState();
    const token = store.beginSend(task.id);
    if (token === null) return;
    const draft = store.texts[task.id] ?? "";
    const submitted = uploads.attachments;
    const mentioned = extractFileReferences(draft)
      .map(splitFileReference)
      .filter((file) => known.has(file.path))
      .map((file) =>
        file.range
          ? { type: "file" as const, path: file.path, range: file.range }
          : { type: "file" as const, path: file.path },
      );
    const chips = useComposerChips.getState().take(task.id);
    const body = messageWithChips(draft.trim(), chips.diffs, chips.contexts);
    const shots = contextImages(chips.contexts);
    if (!body && !submitted.length && !mentioned.length && !shots.length) {
      useComposerChips.getState().restore(chips);
      store.finishSend(task.id, token);
      return;
    }
    try {
      await deliverComposerMessage(task, task.id, body, [...mentioned, ...submitted, ...shots]);
      if (store.finishSend(task.id, token, draft)) uploads.acknowledge(submitted);
    } catch (error) {
      if (store.finishSend(task.id, token)) useComposerChips.getState().restore(chips);
      toast.error(error instanceof Error ? error.message : "Could not send");
    }
  }
  return { sending, capturing, send };
}
