import type { FailureKind } from "@warpforge/core/taskFailures";

const FAILURE_LABEL: Record<FailureKind, string> = {
  interrupted: "Interrupted",
  orchestration: "Node",
  tool_call: "Tool call",
  workflow_stage: "Stage",
};

export function failureKindLabel(kind: FailureKind): string {
  return FAILURE_LABEL[kind];
}
