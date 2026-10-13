// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useFileFind, useProjectFiles } from "./use-files";

const request = vi.hoisted(() => vi.fn());
vi.mock("@warpforge/daemon", () => ({ daemon: { request } }));
vi.mock("../../lib/file-tabs", () => ({ useSavedFind: () => {} }));
let root: Root;
let files: ReturnType<typeof useProjectFiles>;
let find: ReturnType<typeof useFileFind>;
function View({ project }: { project: string }) {
  files = useProjectFiles(project, "");
  find = useFileFind(project, "", undefined);
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
  root = createRoot(document.createElement("div"));
  request.mockReset();
});
afterEach(async () => {
  await act(() => root.unmount());
});

it("ignores stale file lists and searches across checkout switches even with the same query", async () => {
  const aList = pending();
  const aSearch = pending();
  request.mockImplementation((method, params) => {
    if (params.project === "a") return method === "file.list" ? aList.promise : aSearch.promise;
    return Promise.resolve(
      method === "file.list" ? [{ path: "b.txt" }] : [{ path: "b.txt", text: "same" }],
    );
  });
  await act(() => root.render(<View project="a" />));
  await act(() => find.setQuery("same"));
  await act(() => root.render(<View project="b" />));
  await act(() => {
    aList.resolve([{ path: "a.txt" }]);
    aSearch.resolve([{ path: "a.txt" }]);
  });
  expect(files.files).toEqual([{ path: "b.txt" }]);
  expect(find.hits).toEqual([{ path: "b.txt", text: "same" }]);
});

it("does not resurrect results after clearing a search", async () => {
  const search = pending();
  request.mockImplementation((method) =>
    method === "file.search" ? search.promise : Promise.resolve([]),
  );
  await act(() => root.render(<View project="a" />));
  await act(() => find.setQuery("old"));
  await act(() => find.setQuery(""));
  await act(() => search.resolve([{ path: "old.txt" }]));
  expect(find.hits).toEqual([]);
  expect(find.searched).toBe(false);
});
