import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectRuntimeSurface } from "./ProjectRuntimeSurface";

vi.mock("@/components/RuntimePanel", () => ({ RuntimePanel: () => <div>runtime panel</div> }));

describe("ProjectRuntimeSurface local config banner", () => {
  it("shows the error while the local file is ignored and clears once it is fixed", () => {
    const props = { project: "demo", services: [], portforwards: [] };
    const { rerender } = render(
      <ProjectRuntimeSurface {...props} localConfigError="missing field `command`" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your local config (.warpforge/workspace.local.yaml) has an error and is being ignored: missing field `command`",
    );

    rerender(<ProjectRuntimeSurface {...props} localConfigError={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows nothing without an error", () => {
    render(<ProjectRuntimeSurface project="demo" services={[]} portforwards={[]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
