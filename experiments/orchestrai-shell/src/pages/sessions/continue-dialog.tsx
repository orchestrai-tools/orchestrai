import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { findAgent } from "@/data/agents"
import type { AgentSession } from "@/data/sessions"
import { findTask } from "@/data/tasks"
import { exhaustedWindow } from "@/data/usage"
import { findProject } from "@/lib/projects"
import { useAgentsStore } from "@/pages/agents/agents-store"
import { ORIGIN_LABEL } from "@/pages/sessions/session-meta"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

function accountSentence(session: AgentSession): string {
  if (!session.account) return `${findAgent(session.agent).name} uses its own provider keys.`
  if (session.agent === "codex") return `${session.account}. Codex keeps its threads under CODEX_HOME, so it resumes on the account it started on.`
  return `${session.account}, the account it was recorded against.`
}

function ContinueBody({ session, onCancel, onConfirm }: { session: AgentSession; onCancel: () => void; onConfirm: () => void }) {
  const agent = findAgent(session.agent)
  const task = findTask(session.task)
  const project = findProject(session.project)
  const account = useAgentsStore((state) =>
    state.accounts.find((entry) => entry.agent === session.agent && entry.label === session.account)
  )
  const [where, setWhere] = useState("checkout")
  const [track, setTrack] = useState(true)
  const spent = account ? exhaustedWindow(account) : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle>Continue this session</DialogTitle>
        <DialogDescription>
          {agent.name} loads it with its history over ACP (session/load), and from then on it runs here.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <Row label="Session">{session.title}</Row>
        <Row label="Started">
          {ORIGIN_LABEL[session.origin]} · {session.source}
        </Row>
        <Row label="History">{session.turns === null ? "Turn count unknown until it loads" : `${session.turns} turns`}</Row>
        <Row label="Account">{accountSentence(session)}</Row>
      </dl>
      {spent && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {session.account} is out of quota: the {spent.label.toLowerCase()} limit is reached and {spent.resets}. New runs on it are
          refused until then. Wait, or switch accounts on the Agents page and start a fresh session.
        </p>
      )}
      {task ? (
        <p className="text-xs text-muted-foreground">
          It continues in {task.id}'s worktree, <span className="font-mono">{task.worktree}</span>.
        </p>
      ) : (
        <Field>
          <FieldLabel>Run it in</FieldLabel>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={where} onValueChange={(next) => next && setWhere(next)} className="w-full">
            <ToggleGroupItem value="checkout" className="flex-1 text-xs">
              The {project.name} checkout ({project.branch})
            </ToggleGroupItem>
            <ToggleGroupItem value="worktree" className="flex-1 text-xs">
              A new worktree
            </ToggleGroupItem>
          </ToggleGroup>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={track} onCheckedChange={(checked) => setTrack(checked === true)} />
            Track it on the board as a task
          </label>
        </Field>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={spent !== undefined} onClick={onConfirm}>
          Continue
        </Button>
      </DialogFooter>
    </>
  )
}

/** Continue is ACP `session/load`. The account a session was created on is where it resumes. */
export function ContinueDialog({
  session,
  onOpenChange,
  onConfirm,
}: {
  session: AgentSession | null
  onOpenChange: (open: boolean) => void
  onConfirm: (session: AgentSession) => void
}) {
  return (
    <Dialog open={session !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {session && (
          <ContinueBody
            key={session.id}
            session={session}
            onCancel={() => onOpenChange(false)}
            onConfirm={() => {
              onConfirm(session)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
