import { describe, expect, it } from "vitest";
import { versionState } from "./version-pill";

describe("versionState", () => {
  it("puts a running install ahead of everything else", () => {
    expect(versionState({ installed: false, busy: true })).toBe("installing");
  });

  it("reports a broken install before its version status", () => {
    expect(versionState({ installed: true, status: "behind", broken: true })).toBe("broken");
  });

  it("maps the daemon's status words", () => {
    expect(versionState({ installed: false })).toBe("missing");
    expect(versionState({ installed: true, status: "missing" })).toBe("missing");
    expect(versionState({ installed: true, status: "behind" })).toBe("behind");
    expect(versionState({ installed: true, status: "current" })).toBe("current");
    expect(versionState({ installed: true, status: null })).toBe("unknown");
  });
});
