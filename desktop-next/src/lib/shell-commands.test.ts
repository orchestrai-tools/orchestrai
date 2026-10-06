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

describe("saved shell commands", () => {
  it("pins a command for one project and forgets it", async () => {
    installStorage();
    const { readSaved, toggleSaved } = await import("./shell-commands");
    expect(toggleSaved("demo", "cargo test")).toEqual(["cargo test"]);
    expect(toggleSaved("other", "git status")).toEqual(["git status"]);
    expect(readSaved("demo")).toEqual(["cargo test"]);
    expect(toggleSaved("demo", "cargo test")).toEqual([]);
  });

  it("keeps history on the project that ran the command", async () => {
    installStorage();
    const { readHistory, writeHistory } = await import("./shell-commands");
    localStorage.setItem("orc-shell-history", JSON.stringify(["echo board"]));
    expect(readHistory("demo")).toEqual(["echo board"]);
    writeHistory("demo", ["cargo test"]);
    expect(readHistory("demo")).toEqual(["cargo test"]);
    expect(readHistory("other")).toEqual([]);
  });

  it("drops one project's commands when that project is removed", async () => {
    installStorage();
    const { dropProjectCommands, readHistory, readSaved, toggleSaved, writeHistory } =
      await import("./shell-commands");
    toggleSaved("demo", "cargo test");
    toggleSaved("other", "git status");
    writeHistory("demo", ["cargo test"]);
    writeHistory("other", ["git status"]);
    dropProjectCommands("demo");
    expect(readSaved("demo")).toEqual([]);
    expect(readSaved("other")).toEqual(["git status"]);
    expect(readHistory("demo")).toEqual([]);
    expect(readHistory("other")).toEqual(["git status"]);
  });
});
