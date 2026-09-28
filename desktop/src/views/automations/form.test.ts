import { describe, expect, it } from "vitest";

import type { Automation } from "@/protocol";

import { createInput, formFromAutomation, patchFrom } from "./form";

const automation: Automation = {
  agent: "claude",
  createdAt: 1,
  enabled: true,
  id: "a-1",
  missedRunGraceMinutes: 720,
  name: "Nightly",
  project: "warpforge",
  prompt: "Update deps",
  reuseSession: false,
  timezone: "UTC",
  trigger: { cron: "0 9 * * *", preset: "daily" },
  updatedAt: 1,
  worktree: true,
  worktreeBase: { kind: "origin" },
};

describe("automation form worktree base", () => {
  it("round-trips the base into create and update payloads", () => {
    const form = formFromAutomation(automation);
    expect(form.worktreeBase).toEqual({ kind: "origin" });
    expect(createInput(form).worktreeBase).toEqual({ kind: "origin" });
    expect(patchFrom({ ...form, worktreeBase: null }).worktreeBase).toBeNull();
  });

  it("treats a row without a base as the current branch", () => {
    const { worktreeBase: _, ...legacy } = automation;
    expect(formFromAutomation(legacy).worktreeBase).toBeNull();
  });
});
