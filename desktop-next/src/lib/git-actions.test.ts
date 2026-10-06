import { describe, expect, it } from "vitest";
import { runExclusive } from "./git-actions";

describe("runExclusive", () => {
  it("ignores a second git action until the first finishes", async () => {
    const gate = { current: false };
    let release: () => void = () => undefined;
    const first = runExclusive(
      gate,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const second = await runExclusive(gate, async () => {
      throw new Error("should not run");
    });
    expect(second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(await runExclusive(gate, async () => undefined)).toBe(true);
  });
});
