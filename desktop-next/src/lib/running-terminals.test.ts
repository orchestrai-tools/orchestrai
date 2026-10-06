import { describe, expect, it } from "vitest";

import { runningTerminals, terminalLabel } from "./running-terminals";

describe("running terminals", () => {
  it("keeps this project's commands and leaves the others", () => {
    const rows = runningTerminals(
      [
        { project: "demo", command: "bun run dev" },
        { project: "demo", command: "  " },
        { project: "other", command: "bun run test" },
      ],
      "demo",
    );
    expect(rows.map((row) => row.command)).toEqual(["bun run dev"]);
  });

  it("names the login shell and shortens other commands", () => {
    expect(terminalLabel('exec "${SHELL:-/bin/sh}" -l')).toBe("Shell");
    expect(terminalLabel("bun run dev --port 4000")).toBe("bun run dev");
  });
});
