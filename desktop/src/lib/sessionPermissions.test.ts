import { describe, expect, it } from "vitest";

import type { SessionUpdate } from "../protocol";
import { settledPermissions } from "./sessionPermissions";

const request = (id: string): SessionUpdate => ({
  kind: "permission_request",
  options: ["allow", "deny"],
  request_id: id,
  title: "Run the tests",
});

const updates: SessionUpdate[] = [
  request("answered"),
  { kind: "permission_resolved", outcome: "deny", request_id: "answered" },
  request("open"),
];

describe("settledPermissions", () => {
  it("leaves a live session's open request answerable", () => {
    expect(settledPermissions(updates, true)).toEqual({ answered: "deny" });
  });

  it("cancels what a session that stopped working left unanswered", () => {
    expect(settledPermissions(updates, false)).toEqual({ answered: "deny", open: "cancelled" });
  });
});
