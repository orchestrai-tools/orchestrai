import { describe, expect, it } from "vitest";

import { branchActions, type BranchContext } from "./branch-actions";

function ctx(local: string[], current = "main"): BranchContext {
  return {
    target: { task_id: "t1" },
    current,
    local,
    trunk: "main",
    busyBranches: [],
    base: "main",
    onAsk: () => {},
    onConfirm: () => {},
    run: () => {},
  };
}

describe("remote branch checkout", () => {
  it("switches to the local branch with the same name", () => {
    const [first] = branchActions(ctx(["main", "fix/scroll"]), "origin/fix/scroll", true);
    expect(first).toMatchObject({ id: "checkout-local-match", label: "Check out fix/scroll" });
  });

  it("starts a local branch when none matches", () => {
    const [first] = branchActions(ctx(["main"]), "origin/fix/scroll", true);
    expect(first).toMatchObject({ id: "checkout-as-remote", label: "Check out as local…" });
  });

  it("does nothing for the branch already checked out", () => {
    const [first] = branchActions(ctx(["main"]), "origin/main", true);
    expect(first).toMatchObject({ disabled: true, label: "main is checked out" });
  });
});
