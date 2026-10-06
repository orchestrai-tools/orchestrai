import {
  buildAttachments,
  revokeAttachmentPreviews,
  type AttachmentDraft,
} from "@warpforge/core/fileAttachments";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Both composers use the original batch validation, limits, and image capability checks. */
export function usePromptAttachments(imageSupported: boolean) {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const current = useRef(drafts);
  const pending = useRef(Promise.resolve());
  const generation = useRef(0);
  const [reading, setReading] = useState(false);

  const update = (next: AttachmentDraft[]) => {
    current.current = next;
    setDrafts(next);
  };
  const clear = () => {
    generation.current += 1;
    revokeAttachmentPreviews(current.current);
    update([]);
  };
  useEffect(
    () => () => {
      generation.current += 1;
      revokeAttachmentPreviews(current.current);
    },
    [],
  );

  function add(files: File[]) {
    if (!files.length) return;
    const asked = generation.current;
    setReading(true);
    // Serialize picks so two quick drops cannot each bypass the aggregate limits.
    pending.current = pending.current
      .then(async () => {
        if (asked !== generation.current) return;
        try {
          const result = await buildAttachments(files, current.current, { imageSupported });
          if (asked !== generation.current) {
            revokeAttachmentPreviews(result.drafts);
            return;
          }
          if (result.error) toast.error(result.error);
          else update([...current.current, ...result.drafts]);
        } catch {
          toast.error("Could not read the selected files");
        }
      })
      .finally(() => {
        if (pending.current === work) setReading(false);
      });
    const work = pending.current;
  }

  return {
    attachments: drafts.map((draft) => draft.attachment),
    reading,
    add,
    clear,
    remove(index: number) {
      const item = current.current[index];
      if (item) revokeAttachmentPreviews([item]);
      update(current.current.filter((_, at) => at !== index));
    },
  };
}
