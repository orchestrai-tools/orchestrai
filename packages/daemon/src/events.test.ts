import type { DaemonEvent, ProjectInfo, ServiceInfo, Snapshot } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";

import { DaemonClient } from "./index";

class TestClient extends DaemonClient {
  apply(ev: DaemonEvent) {
    this.applyEvent(ev);
  }
}

const project = { name: "demo", path: "/tmp/demo" } as ProjectInfo;
const web = { project: "demo", name: "web" } as ServiceInfo;

function client() {
  const c = new TestClient();
  c.apply({
    event: "state.snapshot",
    data: { projects: [project], services: [web], portforwards: [] } as unknown as Snapshot,
  });
  return c;
}

describe("project.configError", () => {
  it("marks the project and keeps its services", () => {
    const c = client();
    c.apply({ event: "project.configError", data: { project: "demo", error: "bad yaml" } });
    const snap = c.getState().snapshot!;
    expect(snap.projects[0].configError).toBe("bad yaml");
    expect(snap.services).toEqual([web]);
  });

  it("is cleared by the next config change", () => {
    const c = client();
    c.apply({ event: "project.configError", data: { project: "demo", error: "bad yaml" } });
    c.apply({
      event: "project.configChanged",
      data: { project, services: [web], portforwards: [] },
    });
    expect(c.getState().snapshot!.projects[0].configError).toBeUndefined();
  });
});
