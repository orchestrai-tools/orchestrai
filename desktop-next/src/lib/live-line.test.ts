import { describe, expect, it } from "vitest";
import { formatElapsed, liveLine } from "./live-line";

describe("liveLine", () => {
  it("counts recent tools and keeps the latest line", () => {
    const line = liveLine(
      [
        { kind: "tool_call", tool_call_id: "a", title: "Read app.ts", status: "completed", tool_kind: "read" },
        { kind: "agent_text", text: "Done with the shell" },
      ],
      1_000,
      1_090,
    );
    expect(line.tools).toBe(1);
    expect(line.preview).toBe("Done with the shell");
    expect(line.elapsed).toBe("1m");
    expect(line.activity).toBeNull();
    expect(formatElapsed(1_000, 1_010)).toBe("10s");
  });
});
