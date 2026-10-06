import { describe, expect, it } from "vitest";
import type { PortForwardInfo, ServiceInfo } from "@warpforge/protocol";
import { servicePaletteActions } from "./service-actions";

const web = {
  project: "demo",
  name: "web",
  command: "bun run dev",
  status: "running",
  originalPort: 4000,
  allocatedPort: 4000,
  logSeq: 0,
} satisfies ServiceInfo;

const api = {
  project: "other",
  name: "api",
  command: "bun run api",
  status: "stopped",
  originalPort: 4100,
  allocatedPort: 4100,
  logSeq: 0,
} satisfies ServiceInfo;

const db = {
  project: "demo",
  name: "db",
  namespace: "default",
  pod: "db-0",
  localPort: 5432,
  remotePort: 5432,
  status: "stopped",
  logSeq: 0,
} satisfies PortForwardInfo;

describe("servicePaletteActions", () => {
  it("names this project's services and port forwards", () => {
    const labels = servicePaletteActions("demo", [web, api], [db]).map((action) => action.label);
    expect(labels).toContain("Start all services");
    expect(labels).toContain("Restart web");
    expect(labels).toContain("Start port forward db");
    expect(labels).not.toContain("Start api");
  });
});
