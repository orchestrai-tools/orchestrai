import { describe, expect, it } from "vitest";

import type { SessionUpdate } from "../protocol";
import { sessionUpdatesSemanticallyEqual } from "./sessionEquality";

const consultation: Extract<SessionUpdate, { kind: "advisor_consultation" }> = {
  advisor_task_id: "t_adv",
  agent: "codex",
  answer: "Use a lock file.",
  kind: "advisor_consultation",
  outcome: "answered",
  question: "How do I stop the race?",
};

describe("sessionUpdatesSemanticallyEqual for advisor consultations", () => {
  it("treats a copy with the same content as equal", () => {
    expect(sessionUpdatesSemanticallyEqual(consultation, { ...consultation })).toBe(true);
  });

  it.each([
    ["question", { question: "Why?" }],
    ["answer", { answer: "Retry." }],
    ["outcome", { outcome: "failed" as const }],
    ["advisor task", { advisor_task_id: "t_other" }],
  ])("tells a different %s apart", (_, change) => {
    expect(sessionUpdatesSemanticallyEqual(consultation, { ...consultation, ...change })).toBe(
      false,
    );
  });
});
