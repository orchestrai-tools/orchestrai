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

describe("hidden sessions", () => {
  it("hides a session in one project and brings it back", async () => {
    installStorage();
    const { hiddenSessionIds, hideSession, unhideSession } = await import("./hidden-sessions");
    expect(hideSession("demo", "demo-pi")).toEqual(["demo-pi"]);
    expect(hideSession("other", "demo-goose")).toEqual(["demo-goose"]);
    expect(hiddenSessionIds("demo")).toEqual(["demo-pi"]);
    expect(unhideSession("demo", "demo-pi")).toEqual([]);
    expect(hiddenSessionIds("other")).toEqual(["demo-goose"]);
  });

  it("drops the hidden list when the project is removed", async () => {
    installStorage();
    const { dropHiddenSessions, hiddenSessionIds, hideSession } = await import("./hidden-sessions");
    hideSession("demo", "demo-pi");
    hideSession("other", "demo-goose");
    dropHiddenSessions("demo");
    expect(hiddenSessionIds("demo")).toEqual([]);
    expect(hiddenSessionIds("other")).toEqual(["demo-goose"]);
  });
});
