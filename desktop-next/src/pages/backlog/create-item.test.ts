import type { BacklogItem } from "@warpforge/protocol";
import { describe, expect, it, vi } from "vitest";

import { createWorkItem, type NewItemInput } from "./create-item";

const row: BacklogItem = {
  id: "item-3",
  number: 3,
  project: "demo",
  title: "Fix it",
  body: "",
  status: "todo",
  priority: "none",
  source: "github",
  createdAt: 1,
  updatedAt: 1,
};

function fakeClient() {
  return {
    createBacklog: vi.fn(async () => row),
    createExternalWorkItem: vi.fn(async () => ({
      itemId: row.id,
      provider: "github" as const,
      externalId: "#41",
      url: "https://github.com/example/demo/issues/41",
      status: "todo",
    })),
    attachBacklogExternal: vi.fn(async () => undefined),
    deleteBacklog: vi.fn(async () => undefined),
  };
}

const input = (source: NewItemInput["source"]): NewItemInput => ({
  project: "demo",
  source,
  title: "Fix it",
  body: "Details",
  status: "waiting",
  priority: "high",
  assignee: "ada",
});

describe("createWorkItem", () => {
  it("keeps a local item local, with its status and assignee", async () => {
    const client = fakeClient();
    const result = await createWorkItem(client, input("local"));
    expect(result.externalId).toBeUndefined();
    expect(client.createBacklog).toHaveBeenCalledWith(
      expect.objectContaining({ source: "local", status: "waiting", assignee: "ada" }),
    );
    expect(client.createExternalWorkItem).not.toHaveBeenCalled();
  });

  it("opens the tracker issue and links it to the row", async () => {
    const client = fakeClient();
    const result = await createWorkItem(client, input("github"));
    expect(client.createBacklog).toHaveBeenCalledWith(
      expect.objectContaining({ source: "github", status: "todo", assignee: null }),
    );
    expect(client.createExternalWorkItem).toHaveBeenCalledWith({
      itemId: "item-3",
      project: "demo",
      provider: "github",
      title: "Fix it",
      body: "Details",
    });
    expect(client.attachBacklogExternal).toHaveBeenCalledWith({
      itemId: "item-3",
      project: "demo",
      provider: "github",
      externalId: "#41",
      url: "https://github.com/example/demo/issues/41",
    });
    expect(result.externalId).toBe("#41");
    expect(result.item.url).toBe("https://github.com/example/demo/issues/41");
  });

  it("deletes the row again when the tracker refuses", async () => {
    const client = fakeClient();
    client.createExternalWorkItem.mockRejectedValueOnce(new Error("no repo"));
    await expect(createWorkItem(client, input("linear"))).rejects.toThrow("no repo");
    expect(client.deleteBacklog).toHaveBeenCalledWith("item-3", "demo");
    expect(client.attachBacklogExternal).not.toHaveBeenCalled();
  });
});
