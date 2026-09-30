import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortForwardInfo, ServiceInfo } from "../../protocol";
import { PortForwardHeading, ServiceHeading } from "./RuntimeDetail";

const service: ServiceInfo = {
  allocatedPort: 0,
  command: "bun analytics",
  logSeq: 0,
  name: "analytics",
  originalPort: 0,
  project: "demo",
  status: "stopped",
};

const forward: PortForwardInfo = {
  localPort: 5433,
  logSeq: 0,
  name: "pg",
  namespace: "dev",
  pod: "postgres",
  project: "demo",
  remotePort: 5432,
  status: "stopped",
};

describe("local badge", () => {
  it("is absent for shared config", () => {
    render(<ServiceHeading service={service} />);
    render(<PortForwardHeading pf={forward} />);
    expect(screen.queryByText("local")).not.toBeInTheDocument();
  });

  it("lists the overridden service fields in its tooltip", () => {
    render(<ServiceHeading service={{ ...service, local: true, localFields: ["dependsOn"] }} />);
    expect(screen.getByText("local")).toHaveAttribute(
      "title",
      "analytics is set by your local config: dependsOn",
    );
  });

  it("marks a local port-forward", () => {
    render(<PortForwardHeading pf={{ ...forward, local: true, localFields: ["localPort"] }} />);
    expect(screen.getByText("local")).toHaveAttribute(
      "title",
      "pg is set by your local config: localPort",
    );
  });
});
