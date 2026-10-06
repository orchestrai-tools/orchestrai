import { describe, expect, it } from "vitest";
import { workflowNotes } from "./workflow-notes";

const yaml = `
review:
  max_rounds: 3
  on_limit: ask
  reviewers:
    - agent: codex
      prompt: |
        Review {{diff}} in round {{round}}.
    - # agent: claude
      focus: security
fix:
  prompt: Address {{findings}} for {{task_prompt}}.
`;

describe("workflowNotes", () => {
  it("reads the limit action, reviewers, and template variables", () => {
    expect(workflowNotes(yaml)).toEqual({
      onLimit: "ask",
      reviewers: ["codex", "Lead"],
      variables: ["diff", "round", "findings", "task_prompt"],
    });
  });

  it("returns nothing for a file without a review block", () => {
    expect(workflowNotes("name: Plain\nimplement:\n  prompt: Do the work\n")).toEqual({
      onLimit: null,
      reviewers: [],
      variables: [],
    });
  });
});