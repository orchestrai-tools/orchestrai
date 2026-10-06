import { workflowFile, type Retry, type Workflow, type WorkflowStep } from "@/data/workflows"

const WIDTH = 72

function wrap(text: string, width = WIDTH): string[] {
  return text.split("\n").flatMap((paragraph) => {
    if (paragraph.length <= width) return [paragraph]
    const lines: string[] = []
    let line = ""
    for (const word of paragraph.split(" ")) {
      if (line && line.length + word.length + 1 > width) {
        lines.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    }
    return line ? [...lines, line] : lines
  })
}

/** Plain scalars break on `: `, ` #`, and a few leading characters; quote only those. */
function scalar(value: string): string {
  return /: | #|^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ? JSON.stringify(value) : value
}

/** Prompts are written already wrapped; only one-line text such as tester's notes needs wrapping. */
function blockText(key: string, text: string, indent: string): string[] {
  const lines = text.includes("\n") ? text.split("\n") : wrap(text)
  return [`${indent}${key}: |`, ...lines.map((line) => (line ? `${indent}  ${line}` : ""))]
}

function retryLines(retry: Retry, indent: string): string[] {
  const lines = [`${indent}retry:`, `${indent}  max_retries: ${retry.max}${retry.note ? ` # ${retry.note.toLowerCase()}` : ""}`]
  if (retry.checks?.length) {
    lines.push(`${indent}  checks:`)
    for (const check of retry.checks) lines.push(`${indent}    - type: shell`, `${indent}      command: ${scalar(check)}`)
  }
  lines.push(`${indent}  on_failure: ${retry.onFailure === "Asks you" ? "ask" : scalar(retry.onFailure)}`)
  return lines
}

function stepLines(step: WorkflowStep): string[] {
  const at = "    "
  const lines = [`  - id: ${step.id}`, `${at}kind: ${step.kind}`]
  if (step.agent) lines.push(`${at}agent: ${step.agent}`)
  if (step.model) lines.push(`${at}model: ${step.model}`)
  if (step.readOnly && step.kind === "agent") lines.push(`${at}read_only: true`)
  if (step.prompt) lines.push(...blockText("prompt", step.prompt, at))
  if (step.run) {
    lines.push(`${at}run:`)
    for (const check of step.run) {
      lines.push(`${at}  - name: ${check.name}`, `${at}    command: ${scalar(check.command)}`, `${at}    timeout: ${check.timeout}`)
    }
  }
  if (step.verify) {
    lines.push(
      `${at}required: ${step.verify.required} # true: no review without a pass; false: note it and move on`,
      `${at}max_attempts: ${step.verify.maxAttempts} # failed checks in a row before it asks you`
    )
    if (step.verify.instructions) lines.push(...blockText("instructions", step.verify.instructions, at))
  }
  if (step.review) {
    const { review } = step
    const fixes = Math.max(review.maxRounds - 1, 0)
    lines.push(
      `${at}max_rounds: ${review.maxRounds} # a fix runs between rounds, so ${review.maxRounds} = ${fixes} fix attempt${fixes === 1 ? "" : "s"}`,
      `${at}on_limit: ${review.onLimit} # ask | finish`,
      `${at}reask: ${review.reask} # same_session | fresh`,
      `${at}context: [${review.context.join(", ")}]`,
      `${at}reviewers: # 1 to 4; omitted agent and model use the lead agent`
    )
    for (const reviewer of review.reviewers) {
      const entry = [
        reviewer.agent && `agent: ${reviewer.agent}`,
        reviewer.model && `model: ${reviewer.model}`,
        `focus: ${scalar(reviewer.focus)}${reviewer.prompt ? " # only used when the prompt below says {{focus}}" : ""}`,
      ].filter((line): line is string => Boolean(line))
      lines.push(...entry.map((line, index) => `${at}  ${index === 0 ? "- " : "  "}${line}`))
      if (reviewer.prompt) lines.push(...blockText("prompt", reviewer.prompt, `${at}    `))
    }
  }
  if (step.fanOut) {
    lines.push(
      `${at}pool: [${step.fanOut.pool.join(", ")}]`,
      `${at}max_parallel: ${step.fanOut.maxParallel}`,
      `${at}worktrees: ${step.fanOut.worktrees} # each node codes in its own copy of the repo`,
      `${at}nesting: refused # a worker cannot start workers of its own`
    )
  }
  if (step.response && step.kind === "agent") {
    lines.push(`${at}response:`, `${at}  name: ${step.response.name}`, `${at}  fields: ${scalar(step.response.shape)}`)
  }
  if (step.retry) lines.push(...retryLines(step.retry, at))
  if (step.loopsTo) {
    const note = step.kind === "check" && !step.retry ? "grind: every failure goes back, until the turn cap" : step.inherits ? `omitted agent and model inherit ${step.inherits}` : undefined
    lines.push(`${at}loops_to: ${step.loopsTo}${note ? ` # ${note}` : ""}`)
  }
  return lines
}

function header(workflow: Workflow): string[] {
  if (workflow.source === "builtin") {
    return [`# Built-in workflow: ${workflow.id}. Copy it to the project to edit;`, "# the copy in .warpforge/workflows/ then hides this one."]
  }
  const lines = [`# ${workflowFile(workflow)}`]
  if (workflow.overrides) lines.push("# Hides the built-in with the same id. Delete this file to get the built-in back.")
  return lines
}

/** The file as it would sit in `.warpforge/workflows/`, generated from the same data the Steps view reads. */
export function workflowYaml(workflow: Workflow): string {
  if (workflow.yaml) return workflow.yaml
  const lines = [...header(workflow), "version: 2", `name: ${scalar(workflow.name)}`, `description: ${scalar(workflow.description)}`, ""]
  if (workflow.parameters.length) {
    lines.push("parameters:")
    for (const param of workflow.parameters) {
      lines.push(`  - key: ${param.key}`, `    input_type: ${param.type}`, `    requirement: ${param.requirement}`)
      if (param.default) lines.push(`    default: ${scalar(param.default)}`)
      lines.push(`    description: ${scalar(param.description)}`)
    }
    lines.push("")
  }
  const { ending } = workflow
  lines.push("ending:", `  mode: ${ending.mode} # goal: check the result and stop · grind: keep going to the turn cap`)
  if (ending.turnCap) lines.push(`  turn_cap: ${ending.turnCap}`)
  lines.push(`  done_when: ${scalar(ending.doneWhen)}`)
  if (ending.atCap) lines.push(`  at_cap: ${scalar(ending.atCap)}`)
  lines.push("", `stops: [${workflow.stops.join(", ")}] # where a task stops for you; each task can change them`, "", "steps:")
  workflow.steps.forEach((step, index) => {
    if (index > 0) lines.push("")
    lines.push(...stepLines(step))
  })
  lines.push("", "# OrchestrAI appends the need_user_input and verdict JSON protocols to every prompt.")
  return `${lines.join("\n")}\n`
}
