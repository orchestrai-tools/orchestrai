import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DecisionRowActions } from "@/components/DecisionRowActions";
import type { AttentionItem } from "@/lib/attentionRail";
import type { PermissionUpdate } from "@/lib/sessionPermissions";

import * as decisionActions from "./decisionActions";
import { approvePermissionOption } from "./permissionApproval";
import * as permissionToast from "./permissionToast";

vi.mock("../daemon", () => ({
  daemon: {
    request: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    workflowDecide: vi.fn<(...args: unknown[]) => Promise<void>>(),
    workflowReply: vi.fn<(...args: unknown[]) => Promise<void>>(),
  },
}));

function perm(options: string[]): PermissionUpdate {
  return { kind: "permission_request", options, request_id: "req-1", title: "Allow?" };
}

function item(options: string[]): AttentionItem {
  return {
    permission: perm(options),
    priority: 0,
    reason: "reason",
    task: {
      agent: "claude",
      blockedReason: null,
      createdAt: 1,
      filesChanged: 0,
      id: "t_1",
      project: "warpforge",
      prompt: "Do the work",
      status: "running",
      tags: [],
      title: "Do the work",
      updatedAt: 10,
    },
  };
}

describe("approvePermissionOption", () => {
  it.each([
    // The daemon's canonical labels: one-shot allow wins, never allow_always.
    [["allow", "allow_always", "deny"], "allow"],
    [["allow_always", "deny"], undefined],
    [["deny"], undefined],
    // Legacy/foreign spellings normalize to the same rule.
    [["Allow once", "deny"], "Allow once"],
    [["always_allow", "deny"], undefined],
    [["approve_once", "deny"], "approve_once"],
  ])("resolves %j to %j", (options, expected) => {
    expect(approvePermissionOption(options)).toBe(expected);
  });
});

describe("one approve rule for every caller", () => {
  it("leaves no second approve rule behind", () => {
    expect("permissionApproveOption" in decisionActions).toBe(false);
    expect("permissionToastApproveOption" in permissionToast).toBe(false);
  });

  it("marks the same option as approve in the decision row", () => {
    render(<DecisionRowActions item={item(["allow", "allow_always", "deny"])} />);

    // `approvePermissionOption` says "allow"; the row styles it as the safe
    // action and every other option as destructive.
    expect(approvePermissionOption(["allow", "allow_always", "deny"])).toBe("allow");
    expect(screen.getByRole("button", { name: "allow" }).className).not.toContain("bg-destructive");
    expect(screen.getByRole("button", { name: "deny" }).className).toContain("bg-destructive");
    expect(screen.getByRole("button", { name: "allow_always" }).className).toContain(
      "bg-destructive",
    );
  });
});
