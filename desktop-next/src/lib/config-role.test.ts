import { describe, expect, it } from "vitest";
import { configRole, filterChoices } from "./config-role";

describe("agent selectors", () => {
  it("keeps model and effort in front and filters a long list", () => {
    expect(configRole({ id: "model", name: "Model", currentValue: "", options: [] })).toBe("model");
    expect(configRole({ id: "thought_level", name: "Thinking", currentValue: "", options: [] })).toBe("effort");
    expect(configRole({ id: "mode", name: "Mode", currentValue: "", options: [] })).toBeNull();
    expect(
      filterChoices(
        [
          { name: "Opus", value: "opus" },
          { name: "Sonnet", value: "sonnet" },
        ],
        "son",
      ),
    ).toEqual([{ name: "Sonnet", value: "sonnet" }]);
  });
});
