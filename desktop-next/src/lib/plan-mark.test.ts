import { describe, expect, it } from "vitest";
import { planMark } from "./plan-mark";

describe("planMark", () => {
  it("marks a finished step, the current step, and a waiting step", () => {
    expect(planMark("completed")).toEqual({ mark: "✓", label: "Completed", done: true });
    expect(planMark("in_progress")).toEqual({ mark: "◐", label: "In progress", done: false });
    expect(planMark("pending")).toEqual({ mark: "○", label: "Pending", done: false });
  });
});
