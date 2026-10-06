import { describe, expect, it } from "vitest";
import { nativeGlass } from "./platform";

describe("nativeGlass", () => {
  it("is on for Mac and Windows and off for Linux", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "platform");
    const set = (value: string) =>
      Object.defineProperty(navigator, "platform", { configurable: true, value });
    set("MacIntel");
    expect(nativeGlass()).toBe(true);
    set("Win32");
    expect(nativeGlass()).toBe(true);
    set("Linux x86_64");
    expect(nativeGlass()).toBe(false);
    if (original) Object.defineProperty(navigator, "platform", original);
  });
});
