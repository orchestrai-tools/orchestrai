// @vitest-environment happy-dom
import type { Memory, MemoryProposal, MemoryStats } from "@warpforge/protocol";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useMemoryRows, useMemoryStats } from "./memory-data";
import type { MemoryFilters } from "./memory-list";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  search: vi.fn(),
  stats: vi.fn(),
  proposals: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@warpforge/daemon", () => ({
  daemon: {
    listMemories: mock.list,
    searchMemories: mock.search,
    memoryStats: mock.stats,
    listMemoryProposals: mock.proposals,
  },
}));
vi.mock("sonner", () => ({ toast: { error: mock.error } }));
vi.mock("../../lib/memory-palette", () => ({ useMemoryRefresh: () => 0 }));

const filters: MemoryFilters = { query: "", scope: "all", kind: "all", tag: "" };
let root: Root;
let rows: ReturnType<typeof useMemoryRows>;
let stats: ReturnType<typeof useMemoryStats>;
function Rows({ query = "", scope = "all", kind = "all" }: Partial<MemoryFilters>) {
  rows = useMemoryRows({ ...filters, query, scope, kind });
  return null;
}
function Stats() {
  stats = useMemoryStats();
  return null;
}
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const memory = (id: string): Memory => ({
  id,
  scope: "global",
  kind: "note",
  content: id,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  lastAccessed: 0,
});
const page = (prefix: string) =>
  Array.from({ length: 50 }, (_, index) => memory(`${prefix}-${index}`));
const counts = (count: number): MemoryStats => ({
  globalCount: count,
  projectCount: count,
  embeddingMode: "fts",
  scopesEnabled: { global: true, project: true },
  perProjectDbExists: true,
});
const proposal = (id: number): MemoryProposal => ({
  id,
  proposal_type: null,
  target_ids: null,
  reason: null,
  status: "pending",
  created_at: 0,
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  mock.list.mockReset().mockResolvedValue([]);
  mock.search.mockReset().mockResolvedValue([]);
  mock.stats.mockReset().mockResolvedValue(counts(0));
  mock.proposals.mockReset().mockResolvedValue([]);
  mock.error.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("keeps the latest search when earlier results arrive last", async () => {
  const old = pending<Memory[]>();
  const current = pending<Memory[]>();
  mock.search.mockImplementation(({ query }) => (query === "old" ? old.promise : current.promise));
  await act(async () => root.render(<Rows query="old" />));
  await act(async () => root.render(<Rows query="new" />));
  await act(async () => current.resolve([memory("new")]));
  await act(async () => old.resolve([memory("old")]));
  expect(rows.rows.map((row) => row.id)).toEqual(["new"]);
  expect(rows.loading).toBe(false);
});

it("ignores stale failures without finishing the current search", async () => {
  const old = pending<Memory[]>();
  const current = pending<Memory[]>();
  mock.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await act(async () => root.render(<Rows query="old" />));
  await act(async () => root.render(<Rows query="new" />));
  await act(async () => old.reject(new Error("old failure")));
  expect(rows.error).toBeNull();
  expect(rows.loading).toBe(true);
  await act(async () => current.reject(new Error("current failure")));
  expect(rows.error).toBe("current failure");
  expect(rows.loading).toBe(false);
});

it("clears the previous filter's rows and rejects its late page", async () => {
  mock.list.mockResolvedValueOnce(page("global"));
  await act(async () => root.render(<Rows />));
  const more = pending<Memory[]>();
  const next = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise).mockReturnValueOnce(next.promise);
  await act(async () => rows.more());
  await act(async () => root.render(<Rows scope="project" kind="decision" />));
  expect(rows.rows).toEqual([]);
  expect(rows.hasMore).toBe(false);
  expect(mock.list).toHaveBeenLastCalledWith({
    scope: "project",
    kind: "decision",
    limit: 50,
    offset: 0,
  });
  await act(async () => next.resolve([memory("project-decision")]));
  await act(async () => more.resolve(page("global-more")));
  expect(rows.rows.map((row) => row.id)).toEqual(["project-decision"]);
});

it("invalidates a pending page on refresh while keeping current rows visible", async () => {
  mock.list.mockResolvedValueOnce(page("initial"));
  await act(async () => root.render(<Rows />));
  const more = pending<Memory[]>();
  const refresh = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise).mockReturnValueOnce(refresh.promise);
  await act(async () => rows.more());
  await act(async () => rows.reload());
  expect(rows.rows).toEqual(page("initial"));
  expect(rows.loading).toBe(true);
  await act(async () => refresh.resolve([memory("refreshed")]));
  await act(async () => more.resolve(page("stale")));
  expect(rows.rows.map((row) => row.id)).toEqual(["refreshed"]);
  expect(rows.hasMore).toBe(false);
});

it("serializes page requests and advances the offset after completion", async () => {
  mock.list.mockResolvedValueOnce(page("first"));
  await act(async () => root.render(<Rows />));
  const more = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise);
  await act(async () => {
    rows.more();
    rows.more();
  });
  expect(mock.list).toHaveBeenCalledTimes(2);
  expect(mock.list).toHaveBeenLastCalledWith({
    scope: undefined,
    kind: undefined,
    limit: 50,
    offset: 50,
  });
  await act(async () => more.resolve(page("second")));
  expect(rows.rows).toHaveLength(100);
  await act(async () => rows.more());
  expect(mock.list).toHaveBeenLastCalledWith({
    scope: undefined,
    kind: undefined,
    limit: 50,
    offset: 100,
  });
  expect(rows.hasMore).toBe(false);
});

it("does not use stale pagination callbacks or show stale page failures after navigation", async () => {
  mock.list.mockResolvedValueOnce(page("first"));
  await act(async () => root.render(<Rows />));
  const staleMore = rows.more;
  const more = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise);
  await act(async () => staleMore());
  await act(async () => root.render(<Rows query="search" />));
  await act(async () => {
    staleMore();
    rows.more();
    more.reject(new Error("old page failed"));
  });
  expect(mock.list).toHaveBeenCalledTimes(2);
  expect(mock.error).not.toHaveBeenCalled();
});

it("reports current pagination errors and retries the same offset", async () => {
  mock.list.mockResolvedValueOnce(page("first"));
  await act(async () => root.render(<Rows />));
  const more = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise);
  await act(async () => rows.more());
  await act(async () => more.reject(new Error("current page failed")));
  expect(mock.error).toHaveBeenCalledWith("current page failed");
  expect(rows.rows).toEqual(page("first"));
  expect(rows.hasMore).toBe(true);
  await act(async () => rows.more());
  expect(mock.list).toHaveBeenLastCalledWith({
    scope: undefined,
    kind: undefined,
    limit: 50,
    offset: 50,
  });
  expect(rows.hasMore).toBe(false);
});

it("keeps the newest counts and proposals when refreshes resolve out of order", async () => {
  const oldStats = pending<MemoryStats>();
  const oldProposals = pending<MemoryProposal[]>();
  const nextStats = pending<MemoryStats>();
  const nextProposals = pending<MemoryProposal[]>();
  mock.stats.mockReturnValueOnce(oldStats.promise).mockReturnValueOnce(nextStats.promise);
  mock.proposals
    .mockReturnValueOnce(oldProposals.promise)
    .mockReturnValueOnce(nextProposals.promise);
  await act(async () => root.render(<Stats />));
  await act(async () => stats.reload());
  await act(async () => {
    nextStats.resolve(counts(2));
    nextProposals.resolve([proposal(2)]);
  });
  await act(async () => {
    oldStats.resolve(counts(1));
    oldProposals.resolve([proposal(1)]);
  });
  expect(stats.stats).toEqual(counts(2));
  expect(stats.proposals).toEqual([proposal(2)]);
});

it("ignores stale stats/proposal errors and reports current failures independently", async () => {
  const oldStats = pending<MemoryStats>();
  const oldProposals = pending<MemoryProposal[]>();
  const nextStats = pending<MemoryStats>();
  const nextProposals = pending<MemoryProposal[]>();
  mock.stats.mockReturnValueOnce(oldStats.promise).mockReturnValueOnce(nextStats.promise);
  mock.proposals
    .mockReturnValueOnce(oldProposals.promise)
    .mockReturnValueOnce(nextProposals.promise);
  await act(async () => root.render(<Stats />));
  await act(async () => stats.reload());
  await act(async () => {
    oldStats.reject(new Error("old stats"));
    oldProposals.reject(new Error("old proposals"));
  });
  expect(stats.statsError).toBeNull();
  expect(stats.proposalError).toBeNull();
  await act(async () => {
    nextStats.reject(new Error("current stats"));
    nextProposals.resolve([proposal(2)]);
  });
  expect(stats.statsError).toBe("current stats");
  expect(stats.proposals).toEqual([proposal(2)]);
});

it("suppresses a pending pagination failure after unmount", async () => {
  mock.list.mockResolvedValueOnce(page("first"));
  await act(async () => root.render(<Rows />));
  const more = pending<Memory[]>();
  mock.list.mockReturnValueOnce(more.promise);
  await act(async () => rows.more());
  await act(async () => root.render(null));
  await act(async () => more.reject(new Error("page closed")));
  expect(mock.error).not.toHaveBeenCalled();
});
