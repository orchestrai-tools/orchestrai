import {
  buildAttachments,
  revokeAttachmentPreviews,
  type AttachmentDraft,
} from "@warpforge/core/fileAttachments";
import type { PromptAttachment } from "@warpforge/protocol";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

interface UploadState {
  snapshot: { drafts: AttachmentDraft[]; reading: boolean };
  generation: number;
  pending: Promise<void>;
}
const empty = { drafts: [] as AttachmentDraft[], reading: false };
const savedUploads = new Map<string, UploadState>();
const listeners = new Set<() => void>();
function makeState(): UploadState {
  return { snapshot: empty, generation: 0, pending: Promise.resolve() };
}
function taskState(taskId: string) {
  let state = savedUploads.get(taskId);
  if (!state) {
    state = makeState();
    savedUploads.set(taskId, state);
  }
  return state;
}
function notify() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function update(state: UploadState, drafts: AttachmentDraft[], reading = state.snapshot.reading) {
  // No composer displays object-URL previews. Release them before retaining bytes.
  revokeAttachmentPreviews(drafts);
  state.snapshot = {
    drafts: drafts.map((draft) => (draft.kind === "image" ? { ...draft, previewUrl: "" } : draft)),
    reading,
  };
  notify();
}
function clearState(state: UploadState) {
  state.generation += 1;
  state.pending = Promise.resolve();
  revokeAttachmentPreviews(state.snapshot.drafts);
  update(state, [], false);
}
export function forgetPromptUploads(taskId: string) {
  const state = savedUploads.get(taskId);
  if (state) clearState(state);
  savedUploads.delete(taskId);
  notify();
}

/** Task uploads and pending reads belong to the task, independent of page mounts. */
export function usePromptAttachments(imageSupported: boolean, taskId?: string) {
  const [local] = useState(makeState);
  const state = taskId ? taskState(taskId) : local;
  const { drafts, reading } = useSyncExternalStore(
    subscribe,
    () => state.snapshot,
    () => empty,
  );
  useEffect(
    () => () => {
      if (!taskId) clearState(local);
    },
    [taskId, local],
  );

  function add(files: File[]) {
    if (!files.length) return;
    const asked = state.generation;
    update(state, state.snapshot.drafts, true);
    // Serialize picks against the latest task snapshot and aggregate limits.
    const work = state.pending
      .then(async () => {
        if (asked !== state.generation) return;
        try {
          const result = await buildAttachments(files, state.snapshot.drafts, { imageSupported });
          if (asked !== state.generation) {
            revokeAttachmentPreviews(result.drafts);
            return;
          }
          if (result.error) toast.error(result.error);
          else update(state, [...state.snapshot.drafts, ...result.drafts]);
        } catch {
          if (asked === state.generation) toast.error("Could not read the selected files");
        }
      })
      .finally(() => {
        if (state.pending === work && asked === state.generation)
          update(state, state.snapshot.drafts, false);
      });
    state.pending = work;
  }

  return {
    attachments: drafts.map((draft) => draft.attachment),
    reading,
    add,
    clear: () => clearState(state),
    acknowledge(submitted: PromptAttachment[]) {
      update(
        state,
        state.snapshot.drafts.filter((draft) => !submitted.includes(draft.attachment)),
      );
    },
    remove(index: number) {
      const item = state.snapshot.drafts[index];
      if (item) revokeAttachmentPreviews([item]);
      update(
        state,
        state.snapshot.drafts.filter((_, at) => at !== index),
      );
    },
  };
}
