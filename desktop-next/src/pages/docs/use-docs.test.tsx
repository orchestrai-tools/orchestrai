// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useFileDrafts } from "../../lib/file-drafts";
import { useDocFile } from "./use-docs";

const request = vi.hoisted(() => vi.fn());
vi.mock("@warpforge/daemon", () => ({ daemon: { request } }));
let root: Root;
let doc: ReturnType<typeof useDocFile>;
function View({ path = "README.md" }: { path?: string }) {
  doc = useDocFile("fixture", path);
  return null;
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useFileDrafts.setState({ scopes: {} });
  root = createRoot(document.createElement("div"));
  request
    .mockReset()
    .mockImplementation((method) =>
      Promise.resolve(method === "file.contents" ? { newText: "disk" } : {}),
    );
});
afterEach(async () => {
  await act(() => root.unmount());
});

it("restores document edits after navigating and remounting", async () => {
  await act(() => root.render(<View />));
  await act(() => doc.setDraft("unsaved README"));
  await act(() => root.render(<View path="other.md" />));
  expect(doc.draft).toBe("disk");
  await act(() => doc.setDraft("other draft"));
  await act(() => root.render(<View />));
  expect(doc.draft).toBe("unsaved README");
  expect(doc.dirty).toBe(true);
  await act(() => root.render(null));
  await act(() => root.render(<View />));
  expect(doc.draft).toBe("unsaved README");
});

it("keeps newer edits when a save resolves and blocks writing after read failure", async () => {
  await act(() => root.render(<View />));
  await act(() => doc.setDraft("submitted"));
  const save = pending();
  request.mockReturnValueOnce(save.promise);
  let saving!: Promise<void>;
  await act(() => {
    saving = doc.write("README.md", "submitted");
  });
  await act(() => doc.setDraft("newer"));
  await act(async () => {
    save.resolve({});
    await saving;
  });
  expect(doc.draft).toBe("newer");
  expect(doc.dirty).toBe(true);
  request.mockRejectedValueOnce(new Error("not UTF-8"));
  await act(() => root.render(<View path="binary.md" />));
  expect(doc.error).toBe("not UTF-8");
  await expect(doc.write("binary.md", "")).rejects.toThrow("not UTF-8");
});
