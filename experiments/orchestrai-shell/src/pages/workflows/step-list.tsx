import type { ReactNode } from "react"

import { findAgent } from "@/data/agents"
import { STEP_KIND_LABEL, type Barrier, type Workflow, type WorkflowStep } from "@/data/workflows"

const CONTEXT_LABEL: Record<string, string> = {
  prompt: "the task",
  plan: "the plan",
  implementer_summary: "the implementer's summary",
  diff: "the working-copy diff",
}

function agentLine(step: WorkflowStep, workflow: Workflow): string {
  if (step.kind === "check") return ""
  if (step.kind === "fan-out") return "Agents from the pool"
  if (step.kind === "review") return `${step.review?.reviewers.length ?? 1} reviewer${step.review?.reviewers.length === 1 ? "" : "s"}`
  if (step.agent) return [findAgent(step.agent).name, step.model].filter(Boolean).join(" · ")
  const from = workflow.steps.find((candidate) => candidate.id === step.inherits)
  if (from?.agent) return `${findAgent(from.agent).name} · same as ${from.title}`
  if (from) return `Lead agent · same as ${from.title}`
  return "Lead agent"
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono break-words">{children}</code>
}

/** A stop says when it happens and what lets the run continue. */
function Handoff({ label, text }: { label: string; text: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-xs">
      <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span>
        <span className="font-medium">{label}</span> {text}
      </span>
    </p>
  )
}

function barrierText(barrier: Barrier) {
  return (
    <>
      when {barrier.when.charAt(0).toLowerCase() + barrier.when.slice(1)}. You choose:{" "}
      <span className="text-muted-foreground">{barrier.choices.join(" · ")}</span>
    </>
  )
}

function StepFacts({ step }: { step: WorkflowStep }) {
  const { review, verify, fanOut, retry } = step
  return (
    <dl className="mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {step.readOnly && <Fact label="Edits">Nothing; read-only</Fact>}
      {step.hands && <Fact label="Hands on">{step.hands}</Fact>}
      {step.run?.map((check, index) => (
        <Fact key={check.name} label={index === 0 ? "Success check" : ""}>
          <Code>{check.command}</Code> <span className="text-muted-foreground">· {check.timeout}</span>
        </Fact>
      ))}
      {review && (
        <>
          {review.reviewers.map((reviewer, index) => (
            <Fact key={index} label={index === 0 ? "Reviewers" : ""}>
              {reviewer.agent ? findAgent(reviewer.agent).name : "Lead agent"}
              {reviewer.model && <span className="text-muted-foreground"> · {reviewer.model}</span>}
              <span className="text-muted-foreground"> — {reviewer.focus}</span>
              {reviewer.prompt && <span className="text-muted-foreground"> · own prompt</span>}
            </Fact>
          ))}
          <Fact label="Rounds">
            Up to {review.maxRounds}. A fix runs between rounds, so {review.maxRounds} buys {Math.max(review.maxRounds - 1, 0)} fix
            {review.maxRounds - 1 === 1 ? " attempt" : " attempts"}.
            <span className="text-muted-foreground"> A file may ask for 5 at most; at the limit you can extend past it.</span>
          </Fact>
          <Fact label="Reviewers see">{review.context.map((item) => CONTEXT_LABEL[item] ?? item).join(", ")}</Fact>
          <Fact label="Re-review">
            {review.reask === "same_session"
              ? "Same reviewer session; it checks each of its own findings"
              : "Fresh reviewers each round, given last round's findings"}
          </Fact>
          {review.onLimit === "finish" && <Fact label="At the limit">Finishes, with open findings in the summary</Fact>}
        </>
      )}
      {verify && (
        <>
          <Fact label="Required">{verify.required ? "Yes: no review without a pass" : "No: a failure is noted, then review"}</Fact>
          <Fact label="Attempts">{verify.maxAttempts} failed in a row before it asks</Fact>
          {verify.instructions && <Fact label="Tester's notes">{verify.instructions}</Fact>}
        </>
      )}
      {fanOut && (
        <>
          <Fact label="Pool">{fanOut.pool.map((agent) => findAgent(agent).name).join(", ")}</Fact>
          <Fact label="At once">Up to {fanOut.maxParallel} nodes</Fact>
          {fanOut.worktrees && <Fact label="Where">Each node in its own worktree</Fact>}
        </>
      )}
      {step.response && (
        <Fact label="Ends with">
          <Code>{step.response.name}</Code> <span className="text-muted-foreground">— {step.response.shape}</span>
        </Fact>
      )}
      {retry && (
        <>
          <Fact label="Retries">
            {retry.max}
            {retry.note && <span className="text-muted-foreground"> · {retry.note.charAt(0).toLowerCase() + retry.note.slice(1)}</span>}
          </Fact>
          {retry.checks?.map((check, index) => (
            <Fact key={check} label={index === 0 ? "Success check" : ""}>
              <Code>{check}</Code>
            </Fact>
          ))}
          <Fact label="On failure">{retry.onFailure === "Asks you" ? "Asks you" : <Code>{retry.onFailure}</Code>}</Fact>
        </>
      )}
    </dl>
  )
}

/** The recipe as a vertical list, in the order the engine runs it. */
export function StepList({ workflow }: { workflow: Workflow }) {
  const titleOf = (id: string) => workflow.steps.find((step) => step.id === id)?.title ?? id
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Steps run in order and each is a child task with its own session. Any agent step can stop to ask one question it cannot
        answer itself; the run waits on that step until you reply.
      </p>
      <ol className="flex flex-col">
        {workflow.steps.map((step, index) => (
          <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
            {index < workflow.steps.length - 1 && <span aria-hidden className="absolute top-6 bottom-1 left-2.5 w-px bg-border" />}
            <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-medium">{step.title}</h3>
                {STEP_KIND_LABEL[step.kind] !== step.title && <span className="text-xs text-muted-foreground">{STEP_KIND_LABEL[step.kind]}</span>}
                {step.loopsTo && <span className="text-xs text-muted-foreground">⇄ back to {titleOf(step.loopsTo)}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{agentLine(step, workflow)}</span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.does}</p>
              <StepFacts step={step} />
              {step.note && <p className="mt-2 text-xs text-muted-foreground">{step.note}</p>}
              {step.stop && <Handoff label="Default stop:" text={`${step.stop}. Each task can change its stops.`} />}
              {step.barrier && <Handoff label="Stops for you" text={barrierText(step.barrier)} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
