import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useComposerChips } from "./composer-chips";
import { usePromptDrafts } from "./prompt-drafts";
import { useComposerSend } from "./use-composer-send";
import { forgetPromptUploads, usePromptAttachments } from "./use-prompt-attachments";
vi.mock("@warpforge/daemon", () => ({ daemon: { request: vi.fn() } }));
let root: Root;
let uploads: ReturnType<typeof usePromptAttachments>;
let sender: ReturnType<typeof useComposerSend>;
const task = { id: "a", project: "fixture", tags: [] } as unknown as TaskInfo;
function View() {
  uploads = usePromptAttachments(false, "a");
  sender = useComposerSend(task, new Set(), uploads);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  usePromptDrafts.setState({ texts: {}, sending: {} });
  useComposerChips.setState({ diffs: [], contexts: [] });
  forgetPromptUploads("a");
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(() => root.unmount());
});
it("keeps sending locked across remount and acknowledges only submitted text and uploads", async () => {
  let resolve!: () => void;
  vi.mocked(daemon.request).mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }) as never,
  );
  await act(() => root.render(<View />));
  await act(async () => {
    usePromptDrafts.getState().set("a", "submitted");
    uploads.add([new File(["one"], "one.txt")]);
  });
  let pending!: Promise<void>;
  await act(() => {
    pending = sender.send();
  });
  expect(sender.sending).toBe(true);
  await act(() => root.render(null));
  await act(() => root.render(<View />));
  expect(sender.sending).toBe(true);
  await act(async () => {
    await sender.send();
    usePromptDrafts.getState().set("a", "newer draft");
    uploads.add([new File(["two"], "two.txt")]);
  });
  expect(daemon.request).toHaveBeenCalledOnce();
  await act(async () => {
    resolve();
    await pending;
  });
  expect(sender.sending).toBe(false);
  expect(usePromptDrafts.getState().texts.a).toBe("newer draft");
  expect(uploads.attachments.map((item) => (item.type === "document" ? item.name : ""))).toEqual([
    "two.txt",
  ]);
});
it("restores failed-send chips without disturbing another task's pending context", async () => {
  vi.mocked(daemon.request).mockRejectedValue(new Error("offline"));
  await act(() => root.render(<View />));
  await act(() => {
    usePromptDrafts.getState().set("a", "keep this");
    useComposerChips
      .getState()
      .addContext({ taskId: "a", id: "a-note", label: "A", body: "A context" });
    useComposerChips
      .getState()
      .addContext({ taskId: "b", id: "b-note", label: "B", body: "B context" });
  });
  await act(async () => {
    await sender.send();
  });
  expect(usePromptDrafts.getState().texts.a).toBe("keep this");
  expect(sender.sending).toBe(false);
  expect(useComposerChips.getState().contexts.map((chip) => chip.id)).toEqual(["a-note", "b-note"]);
  expect(vi.mocked(daemon.request).mock.calls[0][1]).toMatchObject({
    task_id: "a",
    text: "keep this\n\nA context",
  });
});

it("waits for a pending context screenshot and sends its image exactly once", async () => {
  vi.mocked(daemon.request).mockResolvedValue(null);
  await act(() => root.render(<View />));
  await act(() =>
    useComposerChips
      .getState()
      .addContext({
        taskId: "a",
        id: "capture",
        label: "Element",
        body: "Selected element",
        pendingImage: true,
      }),
  );
  expect(sender.capturing).toBe(true);
  await act(async () => {
    await sender.send();
  });
  expect(daemon.request).not.toHaveBeenCalled();
  await act(() =>
    useComposerChips.getState().setImage("capture", { name: "element.png", data: "cG5n" }),
  );
  expect(sender.capturing).toBe(false);
  await act(async () => {
    await sender.send();
  });
  expect(daemon.request).toHaveBeenCalledOnce();
  expect(vi.mocked(daemon.request).mock.calls[0][1]).toMatchObject({
    attachments: [{ type: "image", name: "element.png", data: "cG5n" }],
  });
  expect(useComposerChips.getState().contexts).toEqual([]);
});
