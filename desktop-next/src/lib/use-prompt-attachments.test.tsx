// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { forgetPromptUploads, usePromptAttachments } from "./use-prompt-attachments";
let root: Root;
let uploads: ReturnType<typeof usePromptAttachments>;
function View({ taskId = "a" }: { taskId?: string }) {
  uploads = usePromptAttachments(false, taskId);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  forgetPromptUploads("a");
  forgetPromptUploads("b");
});
afterEach(async () => {
  await act(() => root.unmount());
});

it("keeps multiple document uploads with their task across page remounts", async () => {
  await act(() => root.render(<View />));
  await act(async () => {
    uploads.add([
      new File(["alpha"], "a.txt", { type: "text/plain" }),
      new File(["beta"], "b.md", { type: "text/markdown" }),
    ]);
  });
  expect(uploads.attachments.map((item) => (item.type === "document" ? item.name : ""))).toEqual([
    "a.txt",
    "b.md",
  ]);
  await act(() => root.render(null));
  await act(() => root.render(<View taskId="b" />));
  expect(uploads.attachments).toEqual([]);
  await act(() => root.render(null));
  await act(() => root.render(<View />));
  expect(uploads.attachments).toHaveLength(2);
  await act(() => uploads.clear());
  expect(uploads.attachments).toEqual([]);
});

it("does not reattach a late file read after Clear", async () => {
  await act(() => root.render(<View />));
  let finish!: (bytes: ArrayBuffer) => void;
  const file = new File(["later"], "later.txt");
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => {
    uploads.add([file]);
  });
  expect(uploads.reading).toBe(true);
  await act(() => uploads.clear());
  await act(() => finish(new TextEncoder().encode("later").buffer));
  expect(uploads.attachments).toEqual([]);
  expect(uploads.reading).toBe(false);
});

it("finishes a task's pending upload across page unmount and retains its busy state", async () => {
  await act(() => root.render(<View />));
  let finish!: (bytes: ArrayBuffer) => void;
  const file = new File(["retained"], "retained.txt");
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => {
    uploads.add([file]);
  });
  await act(() => root.render(null));
  await act(() => root.render(<View />));
  expect(uploads.reading).toBe(true);
  await act(() => finish(new TextEncoder().encode("retained").buffer));
  expect(uploads.reading).toBe(false);
  expect(uploads.attachments).toMatchObject([{ type: "document", name: "retained.txt" }]);
});

it("does not resurrect removed-task uploads when a pending read completes", async () => {
  await act(() => root.render(<View />));
  let finish!: (bytes: ArrayBuffer) => void;
  const file = new File(["removed"], "removed.txt");
  file.arrayBuffer = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => {
    uploads.add([file]);
  });
  await act(() => forgetPromptUploads("a"));
  await act(() => finish(new TextEncoder().encode("removed").buffer));
  await act(() => root.render(null));
  await act(() => root.render(<View />));
  expect(uploads.attachments).toEqual([]);
  expect(uploads.reading).toBe(false);
});
