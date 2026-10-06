import { describe, expect, it } from "vitest";
import { chatAgent, isChat } from "./chat";

const agents = [
  { enabled: true, id: "codex" },
  { enabled: true, id: "claude" },
  { enabled: false, id: "goose" },
];

describe("chatAgent", () => {
  it("picks the agent the project used last", () => {
    const tasks = [
      { agent: "claude", createdAt: 1, project: "app" },
      { agent: "codex", createdAt: 5, project: "app" },
      { agent: "claude", createdAt: 9, project: "other" },
    ];
    expect(chatAgent(tasks, agents, "app")).toBe("codex");
  });

  it("uses the agent picked last anywhere when the project has no history", () => {
    const tasks = [
      { agent: "codex", createdAt: 3, project: "other" },
      { agent: "claude", createdAt: 1, project: "other" },
    ];
    expect(chatAgent(tasks, agents, "new")).toBe("codex");
  });

  it("skips an agent that is no longer enabled", () => {
    expect(chatAgent([{ agent: "goose", createdAt: 9, project: "app" }], agents, "app")).toBe("codex");
  });

  it("falls back to claude with no agents configured", () => {
    expect(chatAgent([], [], "app")).toBe("claude");
  });
});

describe("isChat", () => {
  it("is true only for the chat origin", () => {
    expect(isChat({ origin: "chat" })).toBe(true);
    expect(isChat({ origin: null })).toBe(false);
    expect(isChat({ origin: "pr-review" })).toBe(false);
  });
});
