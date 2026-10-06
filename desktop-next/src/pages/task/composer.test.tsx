import type { TaskInfo } from "@warpforge/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Composer } from "./composer";

const task = {
  id: "t1",
  project: "demo",
  agent: "codex",
  tags: [],
  status: "running",
} as unknown as TaskInfo;

function sendButton(patch: Partial<TaskInfo> = {}) {
  const html = renderToStaticMarkup(
    <Composer
      task={{ ...task, ...patch }}
      agentName="Codex"
      running
      commands={[]}
      updates={[]}
      files={{ files: [], known: new Set(), loading: false, error: null }}
    />,
  );
  return html.match(/<button\b[^>]*aria-label="Send"[^>]*>/)?.[0];
}

describe("conversation prompt queue", () => {
  it("keeps Send available during a normal agent turn", () => {
    expect(sendButton()).toBeDefined();
    expect(sendButton()).not.toMatch(/\sdisabled(?:=|[ >])/);
  });
  it("still blocks messages to a pipeline running without a human barrier", () => {
    expect(sendButton({ workflowRun: { stage: "implement" } as never })).toMatch(
      /\sdisabled(?:=|[ >])/,
    );
  });
});
