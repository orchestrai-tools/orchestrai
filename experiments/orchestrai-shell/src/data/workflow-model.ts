import type { AgentId } from "@/data/agents"
import type { Stage } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

/** What a step does. A workflow is a recipe of steps; a task is one run of it. */
export type StepKind = "agent" | "check" | "review" | "verify" | "fan-out"

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  agent: "Agent work",
  check: "Shell check",
  review: "Review",
  verify: "Test in the running app",
  "fan-out": "Agent work in parallel",
}

export interface ShellCheck {
  name: string
  command: string
  timeout: string
}

/** Goose's recipe retry: shell checks that must exit 0, how many tries, and what runs when they run out. */
export interface Retry {
  max: number
  checks?: string[]
  onFailure: string
  note?: string
}

/** Where a run waits for a person, and the choices it offers there. */
export interface Barrier {
  when: string
  choices: string[]
}

export interface Reviewer {
  agent?: AgentId
  model?: string
  focus: string
  prompt?: string
}

export interface ReviewConfig {
  maxRounds: number
  onLimit: "ask" | "finish"
  reask: "same_session" | "fresh"
  context: string[]
  reviewers: Reviewer[]
}

export interface WorkflowStep {
  id: string
  title: string
  kind: StepKind
  does: string
  /** Unset runs on the task's lead agent. */
  agent?: AgentId
  model?: string
  /** A step that pins nothing takes this step's agent and model. */
  inherits?: string
  readOnly?: boolean
  /** What the next step receives from this one. */
  hands?: string
  prompt?: string
  run?: ShellCheck[]
  retry?: Retry
  /** The fenced JSON the step must end with; it is parsed, never trusted as prose. */
  response?: { name: string; shape: string }
  /** The task's default stop at this step. */
  stop?: string
  barrier?: Barrier
  review?: ReviewConfig
  verify?: { required: boolean; maxAttempts: number; instructions?: string }
  fanOut?: { pool: AgentId[]; maxParallel: number; worktrees: boolean }
  loopsTo?: string
  note?: string
}

export interface WorkflowParam {
  key: string
  type: "string" | "number"
  requirement: "required" | "optional"
  default?: string
  description: string
}

/** goal checks the result and stops; grind keeps going until a turn cap. */
export interface WorkflowEnding {
  mode: "goal" | "grind"
  doneWhen: string
  turnCap?: number
  /** What a grind does when it reaches the cap without being done. */
  atCap?: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  source: "project" | "builtin"
  /** Projects whose `.warpforge/workflows/` holds this file. Built-ins are in every project. */
  projects?: ProjectId[]
  /** A project file with a built-in's id hides that built-in. */
  overrides?: boolean
  edited?: string
  /** Set when the file does not load: it is listed greyed with the reason and cannot run. */
  error?: string
  warnings?: string[]
  /** Raw file text, for a file the steps cannot describe. */
  yaml?: string
  parameters: WorkflowParam[]
  ending: WorkflowEnding
  stops: Stage[]
  steps: WorkflowStep[]
}

export const PLAN_PROMPT = `You are the planning stage of a workflow. Explore the code as needed and
write a concise plan: files to touch, approach, edge cases, and how to
verify it. Do not edit files. End with the complete plan; it is handed to
the implementer verbatim.

## Task
{{task_prompt}}`

export const IMPLEMENT_PROMPT = `You are the implementation stage. Implement the task and the approved
plan completely, keep the change focused, and run the checks you can.
Your final message is handed to the reviewers, so say what you did.

## Task
{{task_prompt}}

## Approved plan
{{plan}}`

/** `{{plan}}` is only allowed when the workflow has a plan step. */
export const IMPLEMENT_NO_PLAN_PROMPT = `You are the implementation stage. Implement the task completely, keep
the change focused, and run the checks you can. Your final message is
handed to the reviewers, so say what you did.

## Task
{{task_prompt}}`

export const REVIEW_PROMPT = `You are a code reviewer in workflow round {{round}}/{{max_rounds}}.
Review the implementation against the task. Do not edit files. Verify
claims against the diff and report only concrete, actionable problems.

## Task
{{task_prompt}}

## Implementer's summary
{{implementer_summary}}

## Working-copy diff
{{diff}}`

export const CONTEXT_ALL = ["prompt", "plan", "implementer_summary", "diff"]
export const CONTEXT_NO_PLAN = ["prompt", "implementer_summary", "diff"]

export function plan(over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "plan",
    title: "Plan",
    kind: "agent",
    readOnly: true,
    does: "Explores the code and writes a plan: the files to touch, the approach, edge cases, and how to verify it.",
    hands: "The plan, verbatim, to Implement",
    ...over,
  }
}

export function implement(over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "implement",
    title: "Implement",
    kind: "agent",
    does: "Writes the change in the task's own copy of the repo and runs the checks it can.",
    hands: "Its closing message, as the implementer's summary",
    ...over,
  }
}

export function checks(run: ShellCheck[], fixes = 2): WorkflowStep {
  return {
    id: "checks",
    title: "Checks",
    kind: "check",
    run,
    does: "Runs each command in the task's copy before any review. A failure goes to Fix with the output's tail as a high finding.",
    retry: { max: fixes, onFailure: "Asks you", note: "Counted apart from review rounds" },
    barrier: { when: `Still failing after ${fixes} fixes`, choices: ["Give it more fixes", "Continue to review", "Stop"] },
  }
}

export function verify(config: NonNullable<WorkflowStep["verify"]>, over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "verify",
    title: "Verify",
    kind: "verify",
    readOnly: true,
    does: "Starts the dev services, walks the task's flow in the in-app browser, reads the console, and takes screenshots.",
    response: { name: "verdict", shape: "pass | fail | blocked, summary, checklist[{step, status, note, evidence}], findings[]" },
    verify: config,
    barrier: config.required
      ? { when: `${config.maxAttempts} failed checks in a row, or it cannot run`, choices: ["Extend", "Continue without a pass", "Stop"] }
      : undefined,
    note: config.required
      ? "Reviewers only see work that passed. Screenshots are kept outside the repo, so they never show up in the diff."
      : "Not required: a failure is noted in the summary and the run continues to review.",
    ...over,
  }
}

export function review(config: ReviewConfig): WorkflowStep {
  return {
    id: "review",
    title: "Review",
    kind: "review",
    readOnly: true,
    does: "Reviewers judge the diff against the task and edit nothing. Approve only when no critical, high, or medium finding is left.",
    response: { name: "verdict", shape: "approve | request_changes, findings[{severity, file, line, snippet, description}]" },
    review: config,
    barrier:
      config.onLimit === "ask"
        ? { when: `${config.maxRounds} rounds end with open findings`, choices: ["Extend", "Finish with findings", "Stop"] }
        : undefined,
    note: "Low findings go to the final summary, never to Fix.",
  }
}

export function fix(loopsTo: string, over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "fix",
    title: "Fix",
    kind: "agent",
    inherits: "implement",
    does: "Repairs every finding, or explains why one is wrong. Leaves unrelated code alone.",
    loopsTo,
    ...over,
  }
}
