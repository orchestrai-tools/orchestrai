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
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
}

describe("text size", () => {
  it("moves the interface and code fonts together, then resets both", async () => {
    installStorage();
    const { useAppearance } = await import("./appearance");
    useAppearance.getState().resetText();
    useAppearance.getState().bumpText(1);
    expect(useAppearance.getState().fontSize).toBe(17);
    expect(useAppearance.getState().monoFontSize).toBe(14);
    useAppearance.getState().resetText();
    expect(useAppearance.getState().fontSize).toBe(16);
    expect(useAppearance.getState().monoFontSize).toBe(13);
  });
});
