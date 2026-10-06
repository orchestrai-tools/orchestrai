import { describe, expect, it } from "vitest";
import { accountsForMenu, chipLabel, quotaLeft } from "./account-chip";

describe("account chip", () => {
  const accounts = [
    { id: "claude:work", agentId: "claude", label: "Work", active: true },
    { id: "claude:home", agentId: "claude", label: "Home", active: false },
    { id: "codex:me", agentId: "codex", label: "Me", active: true },
  ];

  it("names the login only when there is a choice", () => {
    expect(chipLabel("claude", "Claude Code", accounts)).toBe("Work");
    expect(chipLabel("codex", "Codex", accounts)).toBe("Codex");
    expect(chipLabel("pi", "Pi", accounts)).toBe("Pi");
    expect(quotaLeft(27)).toBe(73);
    expect(quotaLeft(110)).toBe(0);
  });

  it("puts this task's agent first", () => {
    expect(accountsForMenu("codex", accounts).map((account) => account.id)).toEqual([
      "codex:me",
      "claude:work",
      "claude:home",
    ]);
  });
});
