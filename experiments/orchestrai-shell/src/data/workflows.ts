import { findAgent, type AgentId } from "@/data/agents"
import {
  CONTEXT_ALL,
  CONTEXT_NO_PLAN,
  IMPLEMENT_NO_PLAN_PROMPT,
  IMPLEMENT_PROMPT,
  PLAN_PROMPT,
  fix,
  implement,
  plan,
  review,
  verify,
  type Workflow,
} from "@/data/workflow-model"
import { PROJECT_WORKFLOWS } from "@/data/workflows-project"
import type { ProjectId } from "@/lib/projects"

export * from "@/data/workflow-model"

/** Ship with the app. A project file with the same id hides one; copying one into the project is how it is edited. */
export const BUILTIN_WORKFLOWS: readonly Workflow[] = [
  {
    id: "plan-review-loop",
    name: "Plan → Implement → Review",
    description: "Plan first, implement the plan, then loop review and fix until the reviewers approve.",
    source: "builtin",
    parameters: [],
    ending: { mode: "goal", doneWhen: "Reviewers approve with no critical, high, or medium finding" },
    stops: ["plan", "merge"],
    steps: [
      plan({ prompt: PLAN_PROMPT, stop: "You approve the plan before any code is written" }),
      implement({ prompt: IMPLEMENT_PROMPT }),
      review({ maxRounds: 3, onLimit: "ask", reask: "same_session", context: CONTEXT_ALL, reviewers: [{ focus: "correctness and edge cases" }] }),
      fix("review"),
    ],
  },
  {
    id: "verify-review-loop",
    name: "Implement → Verify",
    description: "Implement the task, test it in the running app, then loop review and fix until approved.",
    source: "builtin",
    parameters: [],
    ending: { mode: "goal", doneWhen: "Verification passes and the reviewer approves" },
    stops: ["merge"],
    steps: [
      implement({ prompt: IMPLEMENT_NO_PLAN_PROMPT }),
      verify({ required: true, maxAttempts: 2 }),
      review({ maxRounds: 3, onLimit: "ask", reask: "same_session", context: CONTEXT_NO_PLAN, reviewers: [{ focus: "correctness and edge cases" }] }),
      fix("verify", { note: "A fix after a failed verification is always verified again; a fix after review only when it changed the code." }),
    ],
  },
  {
    id: "review-loop",
    name: "Implement → Review",
    description: "Implement the task, then loop review and fix until the reviewer approves.",
    source: "builtin",
    parameters: [],
    ending: { mode: "goal", doneWhen: "The reviewer approves" },
    stops: ["merge"],
    steps: [
      implement({ prompt: IMPLEMENT_NO_PLAN_PROMPT }),
      review({ maxRounds: 3, onLimit: "ask", reask: "same_session", context: CONTEXT_NO_PLAN, reviewers: [{ focus: "correctness and edge cases" }] }),
      fix("review"),
    ],
  },
  {
    id: "fan-out",
    name: "Planner → Workers → Reviewers",
    description: "A planner splits the goal into a task graph, workers build the pieces in parallel, and reviewers check each one.",
    source: "builtin",
    parameters: [],
    ending: { mode: "goal", doneWhen: "Every node in the graph is complete" },
    stops: ["merge"],
    steps: [
      {
        id: "plan",
        title: "Plan the graph",
        kind: "agent",
        agent: "claude",
        readOnly: true,
        does: "Splits the goal into nodes, each with a spec and the nodes it depends on, and says which nodes get a review.",
        response: { name: "task_graph", shape: "tasks[{spec, depends_on}], reviews[{diff_ref, target}]" },
      },
      {
        id: "workers",
        title: "Workers",
        kind: "fan-out",
        does: "Each node becomes a child task with its own session and its own copy of the repo. A node starts when the nodes it depends on finish.",
        fanOut: { pool: ["claude", "codex"], maxParallel: 3, worktrees: true },
        barrier: { when: "A node fails: every node that depends on it is skipped", choices: ["Open the failed node", "Stop"] },
        note: "A worker cannot start workers of its own.",
      },
      {
        ...review({ maxRounds: 1, onLimit: "finish", reask: "fresh", context: ["prompt", "diff"], reviewers: [{ agent: "goose", focus: "the node's spec" }] }),
        does: "A reviewer from the pool reviews each node the plan targets, against that node's spec.",
      },
      {
        id: "merge",
        title: "Merge",
        kind: "agent",
        agent: "claude",
        does: "Merges every worker's branch back into the task's base branch.",
        stop: "The task stops here for you before the merge",
      },
    ],
  },
]

/** A project's workflows: its own files first, then the built-ins it does not override. */
export function workflowsFor(project: ProjectId): Workflow[] {
  const files = PROJECT_WORKFLOWS.filter((workflow) => workflow.projects?.includes(project))
  const hidden = new Set(files.map((workflow) => workflow.id))
  return [...files, ...BUILTIN_WORKFLOWS.filter((workflow) => !hidden.has(workflow.id))]
}

export function workflowFile(workflow: Workflow): string {
  return workflow.source === "builtin" ? `Built-in · ${workflow.id}` : `.warpforge/workflows/${workflow.id}.yaml`
}

/** The stage chain a list row shows, e.g. "plan · implement · checks · review ⇄ fix". */
export function stageChain(workflow: Workflow): string {
  const steps = workflow.steps
  return steps
    .map((step, index) => {
      if (step.id === "fix" && steps[index - 1]?.id === "review") return null
      if (step.id === "review" && steps[index + 1]?.id === "fix") return "review ⇄ fix"
      return step.title.toLowerCase()
    })
    .filter(Boolean)
    .join(" · ")
}

/** Every agent a workflow pins, by step, so a run can say up front which pins cannot start. */
export function pinnedAgents(workflow: Workflow): { step: string; agent: AgentId }[] {
  return workflow.steps.flatMap((step) => {
    const pins: { step: string; agent: AgentId }[] = []
    if (step.agent) pins.push({ step: step.title, agent: step.agent })
    for (const reviewer of step.review?.reviewers ?? []) if (reviewer.agent) pins.push({ step: step.title, agent: reviewer.agent })
    for (const agent of step.fanOut?.pool ?? []) pins.push({ step: step.title, agent })
    return pins
  })
}

/** Pins on agents that are not installed or not signed in: a run would stop at that step. */
export function blockedPins(workflow: Workflow) {
  return pinnedAgents(workflow)
    .map((pin) => ({ ...pin, info: findAgent(pin.agent) }))
    .filter((pin) => pin.info.status !== "ready")
}
