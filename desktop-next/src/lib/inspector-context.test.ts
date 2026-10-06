import type { SessionUpdate } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";
import {
  attachmentNames,
  includedServices,
  latestVerification,
  serviceLineUrl,
} from "./inspector-context";

describe("inspector context", () => {
  it("lists attachments and the services the daemon included", () => {
    const updates = [
      {
        kind: "user_message",
        text: "[warpforge] already running\n- web → http://localhost:4001\n- api → http://localhost:4002 (starting)\n\nDo the thing",
        attachments: [{ type: "file", path: "src/app.ts" }],
      },
    ] as SessionUpdate[];
    expect(attachmentNames(updates)).toEqual(["src/app.ts"]);
    expect(
      includedServices(updates[0] && updates[0].kind === "user_message" ? updates[0].text : ""),
    ).toEqual(["web → http://localhost:4001", "api → http://localhost:4002 (starting)"]);
    expect(serviceLineUrl("web → http://localhost:4001")).toBe("http://localhost:4001");
    expect(serviceLineUrl("api → http://localhost:4002 (starting)")).toBeNull();
  });

  it("keeps the newest verification", () => {
    const latest = latestVerification([
      { attempt: 1, summary: "first", checklist: [], evidence: [], verdict: "fail" },
      { attempt: 2, summary: "second", checklist: [], evidence: [], verdict: "pass" },
    ]);
    expect(latest?.attempt).toBe(2);
    expect(latestVerification([])).toBeNull();
  });
});
