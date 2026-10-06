import { demoBacklogItems, demoBacklogReply, filterDemoBacklog } from "@warpforge/daemon/demo-backlog";
import { describe, expect, it } from "vitest";

describe("demoBacklogReply", () => {
  it("imports one new tracker issue, then nothing", () => {
    const first = demoBacklogReply(demoBacklogItems(), "workItem.importExternal", { project: "demo" })!;
    expect((first.reply as { items: unknown[] }).items).toHaveLength(1);
    const again = demoBacklogReply(first.items, "workItem.importExternal", { project: "demo" })!;
    expect((again.reply as { items: unknown[] }).items).toHaveLength(0);
    expect(again.items).toHaveLength(3);
  });

  it("links a task and attaches a tracker issue to a row", () => {
    const linked = demoBacklogReply(demoBacklogItems(), "workItem.linkTask", { item_id: "local-1", task_id: "t1" });
    expect(linked?.items.find((item) => item.id === "local-1")?.taskId).toBe("t1");
    const attached = demoBacklogReply(linked!.items, "backlog.attachExternal", {
      item_id: "local-1",
      external_id: "#9",
      url: "https://github.com/example/demo/issues/9",
    });
    expect(attached?.items.find((item) => item.id === "local-1")?.url).toBe("https://github.com/example/demo/issues/9");
  });

  it("answers the tracker probes and leaves other methods alone", () => {
    expect(demoBacklogReply([], "tracker.projectSources", { project: "demo" })?.reply).toMatchObject({ github: true });
    expect(demoBacklogReply([], "tracker.attachment", { url: "x" })?.reply).toMatchObject({ contentType: "image/svg+xml" });
    expect(demoBacklogReply([], "task.create", {})).toBeNull();
  });
});

describe("filterDemoBacklog", () => {
  const items = demoBacklogItems();

  it("keeps a GitHub issue and leaves a local item out", () => {
    const issues = filterDemoBacklog(items, { project: "demo", source: "github" });
    expect(issues.map((item) => item.id)).toEqual(["gh-12"]);
  });

  it("matches a title search and an assignee", () => {
    expect(
      filterDemoBacklog(items, { project: "demo", search: "board" }).map((item) => item.id),
    ).toEqual(["local-1"]);
    expect(filterDemoBacklog(items, { assignee: "Ada" }).map((item) => item.id)).toEqual([
      "local-1",
    ]);
  });
});
