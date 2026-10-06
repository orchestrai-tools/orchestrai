import { describe, expect, it } from "vitest";
import type { ServiceInfo } from "@warpforge/protocol";
import { localConfigTitle, portWarningText } from "./selected-service";

function service(patch: Partial<ServiceInfo>): ServiceInfo {
  return {
    project: "app",
    name: "web",
    command: "bun dev",
    status: "running",
    originalPort: 3000,
    allocatedPort: 4100,
    logSeq: 0,
    ...patch,
  };
}

describe("portWarningText", () => {
  it("names the port that is not answering", () => {
    expect(portWarningText(service({ portWarning: { expected: 4100 } }))).toBe(
      "Nothing is answering on port 4100.",
    );
  });

  it("includes ports the log mentioned", () => {
    expect(
      portWarningText(service({ portWarning: { expected: 4100, listening: [5174] } })),
    ).toContain("5174");
  });

  it("names the local-config fields", () => {
    expect(localConfigTitle("web", ["command"])).toBe("web is set by your local config: command");
    expect(localConfigTitle("web")).toBe("web is set by your local config");
  });
});
