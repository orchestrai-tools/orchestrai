import { toast } from "sonner";

import { browser, IS_TAURI, onBrowserShot } from "./browser-client";
import { useComposerChips } from "./composer-chips";

export const CAPTURE_TIMEOUT_MS = 15_000;

type CaptureRect = { x: number; y: number; width: number; height: number };
interface PendingCapture {
  taskId: string;
  chipId: string;
  timer: ReturnType<typeof setTimeout>;
}
interface Captures {
  request: (taskId: string, chipId: string, tabId: string, rect: CaptureRect) => Promise<void>;
  dispose: () => void;
}
let captures: Captures | undefined;

/** Capture results belong to task chips, even after their browser pane unmounts. */
export function installBrowserCaptures(): () => void {
  if (!IS_TAURI) return () => {};
  captures?.dispose();
  const pending = new Map<string, PendingCapture>();
  let disposed = false;
  let unlisten: (() => void) | undefined;

  function finish(captureId: string, error?: string, data?: string) {
    const capture = pending.get(captureId);
    if (!capture) return;
    pending.delete(captureId);
    clearTimeout(capture.timer);
    const store = useComposerChips.getState();
    if (
      !store.contexts.some((chip) => chip.id === capture.chipId && chip.taskId === capture.taskId)
    )
      return;
    if (data) {
      store.setImage(capture.chipId, { name: `element-${captureId}.png`, data }, capture.taskId);
    } else {
      store.setPendingImage(capture.chipId, false, capture.taskId);
      if (error)
        toast.error(
          `${error} The annotation is still attached; you can send it or try picking again.`,
        );
    }
  }

  // Subscribe before invoking capture: WKWebView can finish before invoke returns.
  const ready = onBrowserShot(({ captureId, pngBase64 }) => {
    if (pngBase64) finish(captureId, undefined, pngBase64);
    else finish(captureId, "Could not capture the selected element.");
  })
    .then((off) => {
      if (disposed) off();
      else unlisten = off;
      return !disposed;
    })
    .catch(() => false);

  const offChips = useComposerChips.subscribe((state) => {
    for (const [id, capture] of pending) {
      if (
        !state.contexts.some(
          (chip) =>
            chip.id === capture.chipId && chip.taskId === capture.taskId && chip.pendingImage,
        )
      ) {
        finish(id);
      }
    }
  });

  const instance: Captures = {
    async request(taskId, chipId, tabId, rect) {
      if (
        disposed ||
        !useComposerChips
          .getState()
          .contexts.some((chip) => chip.id === chipId && chip.taskId === taskId)
      )
        return;
      for (const [id, capture] of pending) {
        if (capture.chipId === chipId && capture.taskId === taskId) finish(id);
      }
      const captureId = crypto.randomUUID();
      const timer = setTimeout(
        () => finish(captureId, "The screenshot took too long to finish."),
        CAPTURE_TIMEOUT_MS,
      );
      pending.set(captureId, { taskId, chipId, timer });
      useComposerChips.getState().setPendingImage(chipId, true, taskId);
      if (!(await ready)) {
        finish(captureId, "Could not receive browser screenshots.");
        return;
      }
      if (!pending.has(captureId)) return;
      try {
        await browser.captureElement(tabId, captureId, rect);
      } catch {
        finish(captureId, "Could not capture the selected element.");
      }
    },
    dispose() {
      disposed = true;
      unlisten?.();
      offChips();
      for (const id of pending.keys()) finish(id);
      if (captures === instance) captures = undefined;
    },
  };
  captures = instance;
  return instance.dispose;
}

/** Mark the chip busy before waiting for the native listener or operation. */
export async function requestContextCapture(
  taskId: string,
  chipId: string,
  tabId: string,
  rect: CaptureRect,
): Promise<void> {
  if (captures) await captures.request(taskId, chipId, tabId, rect);
  else {
    useComposerChips.getState().setPendingImage(chipId, false, taskId);
    toast.error("Browser screenshots are unavailable. The annotation is still attached.");
  }
}
