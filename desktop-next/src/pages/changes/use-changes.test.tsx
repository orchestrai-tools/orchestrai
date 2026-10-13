// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useChanges } from "./use-changes";

const mock = vi.hoisted(() => ({ request: vi.fn(), state: { snapshot: { tasks: [] } } }));
vi.mock("@warpforge/daemon", () => ({
  daemon: { request: mock.request, subscribe: () => () => {}, getState: () => mock.state },
}));
vi.mock("../../lib/diff-session", () => ({ useDiffView: () => {}, usePruneDiff: () => {} }));
let root: Root;
let host: HTMLDivElement;
let changes: ReturnType<typeof useChanges>;
function View({ project }: { project: string }) {
  changes = useChanges("", project, undefined);
  return null;
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const diff = (path: string) => ({
  files: [{ path, hunks: [], status: "modified" }],
  untrackedPaths: [],
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  root = createRoot(host);
  mock.request.mockReset();
});
afterEach(async () => {
  await act(() => root.unmount());
});

it("discards a previous checkout's late diff and roots before committing", async () => {
  const oldDiff = pending();
  const oldRoots = pending();
  mock.request.mockImplementation((method, params) => {
    if (method === "git.commit") return Promise.resolve({});
    if (params.project === "a") return method === "diff.get" ? oldDiff.promise : oldRoots.promise;
    return Promise.resolve(method === "diff.get" ? diff("b.txt") : { roots: [{ path: "b" }] });
  });
  await act(() => root.render(<View project="a" />));
  await act(() => root.render(<View project="b" />));
  await act(() => {
    oldDiff.resolve(diff("a.txt"));
    oldRoots.resolve({ roots: [{ path: "a" }] });
  });
  expect(changes.diff?.files.map((file) => file.path)).toEqual(["b.txt"]);
  expect(changes.roots).toEqual([{ path: "b" }]);
  await act(async () => {
    await changes.commit("B", false);
  });
  expect(mock.request).toHaveBeenCalledWith("git.commit", {
    project: "b",
    files: ["b.txt"],
    message: "B",
    amend: false,
  });
});

it("keeps the latest refresh and an exact selection even when every shown file is checked", async () => {
  mock.request.mockResolvedValue({ roots: [] });
  mock.request.mockImplementation((method) =>
    Promise.resolve(method === "diff.get" ? diff("selected.txt") : {}),
  );
  await act(() => root.render(<View project="a" />));
  const first = pending();
  const second = pending();
  mock.request
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  await act(() => {
    changes.reload();
    changes.reload();
  });
  await act(() => second.resolve(diff("latest.txt")));
  await act(() => first.resolve(diff("stale.txt")));
  expect(changes.checked).toEqual(["latest.txt"]);
  await act(async () => {
    await changes.commit("exact", false);
  });
  expect(mock.request).toHaveBeenCalledWith(
    "git.commit",
    expect.objectContaining({ files: ["latest.txt"] }),
  );
  await act(() => changes.setChecked([]));
  await expect(changes.commit("empty", false)).rejects.toThrow("Check a file");
});
