import { describe, expect, it } from "vitest";
import { liveResourceSummary, projectLiveCounts } from "./project-live";

describe("projectLiveCounts", () => {
  it("counts live services, port forwards, and terminals for one project", () => {
    const counts = projectLiveCounts(
      {
        services: [
          { project: "app", status: "running" },
          { project: "app", status: "stopped" },
          { project: "other", status: "running" },
        ],
        portforwards: [{ project: "app", status: "starting" }],
        terminals: [{ project: "app" }, { project: "other" }],
      } as never,
      "app",
    );
    expect(counts).toEqual({ services: 1, portforwards: 1, terminals: 1 });
    expect(liveResourceSummary(counts)).toBe("1 service, 1 port forward, 1 terminal");
    expect(liveResourceSummary({ services: 0, portforwards: 0, terminals: 0 })).toBeNull();
  });
});
