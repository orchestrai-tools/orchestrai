import { demoAccountReply } from "@warpforge/daemon/demo-accounts";
import { describe, expect, it } from "vitest";

const work = {
  active: true,
  agentId: "claude",
  id: "claude:work",
  label: "Work",
  plan: "Max",
};

describe("demoAccountReply", () => {
  it("lists the accounts it was given", () => {
    expect(demoAccountReply([work], "accounts.list", {})).toEqual([work]);
  });

  it("imports, activates, and removes a login", () => {
    const imported = demoAccountReply([work], "accounts.import", {
      agent_id: "claude",
      label: "Side",
    });
    expect(imported?.map((account) => account.label)).toEqual(["Work", "Side"]);
    const active = demoAccountReply(imported ?? [], "accounts.setActive", {
      account_id: "claude:side",
      agent_id: "claude",
    });
    expect(active?.find((account) => account.id === "claude:side")?.active).toBe(true);
    expect(active?.find((account) => account.id === "claude:work")?.active).toBe(false);
    expect(
      demoAccountReply(active ?? [], "accounts.remove", { account_id: "claude:side" }),
    ).toEqual([{ ...work, active: false }]);
  });
});
