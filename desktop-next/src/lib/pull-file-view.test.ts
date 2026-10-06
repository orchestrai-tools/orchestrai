import { describe, expect, it } from "vitest";

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}

describe("pull file view", () => {
  it("keeps the last reading, including one saved by the previous app", async () => {
    installStorage();
    const { readPullFileView, writePullFileView } = await import("./pull-file-view");
    expect(readPullFileView()).toBe("list");
    localStorage.setItem("wf-pull-files-view", "groups");
    expect(readPullFileView()).toBe("groups");
    writePullFileView("tree");
    expect(readPullFileView()).toBe("tree");
  });
});
