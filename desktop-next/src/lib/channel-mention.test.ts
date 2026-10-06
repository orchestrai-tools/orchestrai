import { describe, expect, it } from "vitest";
import { applyMention, channelMentionParts, mentionMatches, mentionQuery } from "./channel-mention";

const agents = [
  { id: "claude", name: "Claude" },
  { id: "codex", name: "Codex" },
];

describe("channel mentions", () => {
  it("reads the @word at the caret", () => {
    expect(mentionQuery("ask @cl", 7)).toEqual({ start: 4, text: "cl" });
    expect(mentionQuery("done", 4)).toBeNull();
    expect(mentionQuery("email me@x", 10)).toBeNull();
  });

  it("offers agents whose id or name starts with the query", () => {
    expect(mentionMatches(agents, "co").map((agent) => agent.id)).toEqual(["codex"]);
    expect(mentionMatches(agents, "cl").map((agent) => agent.id)).toEqual(["claude"]);
  });

  it("marks an enabled agent in a posted message", () => {
    expect(
      channelMentionParts("Ask @claude to look.", ["claude"]).map((part) => part.text),
    ).toEqual(["Ask ", "@claude", " to look."]);
    expect(
      channelMentionParts("email me@claude", ["claude"]).every((part) => part.kind === "text"),
    ).toBe(true);
  });

  it("replaces the @word with the chosen agent", () => {
    expect(applyMention("ask @cl", 4, 7, "claude")).toEqual({
      value: "ask @claude ",
      caret: 12,
    });
  });
});
