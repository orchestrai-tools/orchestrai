import { useState } from "react"
import { useShallow } from "zustand/react/shallow"

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AgentId } from "@/data/agents"
import { AGENT_SETUP, DENYLIST_RULES, PERMISSION_PROFILES, type AgentDefaults } from "@/data/agent-setup"
import { useAgent, useAgentsStore } from "@/pages/agents/agents-store"

const INHERIT = "inherit"

const profileHint = (id: string) => PERMISSION_PROFILES.find((profile) => profile.id === id)?.hint ?? ""

function Choice({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  description?: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup type="single" variant="outline" size="sm" spacing={1} value={value} onValueChange={(next) => next && onChange(next)} className="flex-wrap justify-start">
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="h-7 px-2 text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function AgentForm({ id, onDone }: { id: AgentId; onDone: () => void }) {
  const agent = useAgent(id)
  const stored = useAgentsStore((state) => state.defaults[id])
  const globalProfile = useAgentsStore((state) => state.profile)
  const writesGitText = useAgentsStore((state) => state.gitTextAgent === id)
  const saveDefaults = useAgentsStore((state) => state.saveDefaults)
  const setup = AGENT_SETUP[id]
  const [draft, setDraft] = useState<AgentDefaults>(stored)
  const [gitText, setGitText] = useState(writesGitText)
  const pick = (key: keyof AgentDefaults) => (value: string) => setDraft((current) => ({ ...current, [key]: value === INHERIT ? null : value }))
  const choices = (values: string[]) => values.map((value) => ({ value, label: value }))

  return (
    <>
      <DialogHeader>
        <DialogTitle>Defaults for {agent.name}</DialogTitle>
        <DialogDescription>
          New sessions with {agent.name} start with these. Anything left on its default is inherited, from the agent or from the global profile.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Choice
          label="Model"
          value={draft.model ?? INHERIT}
          onChange={pick("model")}
          options={[{ value: INHERIT, label: `Agent default (${agent.model})` }, ...choices(setup.models)]}
          description="The models this agent offers, read from it over ACP."
        />
        {setup.efforts.length > 0 && (
          <Choice label="Effort" value={draft.effort ?? INHERIT} onChange={pick("effort")} options={[{ value: INHERIT, label: "Agent default" }, ...choices(setup.efforts)]} />
        )}
        <Choice
          label="Mode"
          value={draft.mode ?? INHERIT}
          onChange={pick("mode")}
          options={[{ value: INHERIT, label: `Agent default (${setup.modes[0]})` }, ...choices(setup.modes.slice(1))]}
          description="The session modes this agent advertises over ACP."
        />
        <Choice
          label="Permission profile"
          value={draft.profile ?? INHERIT}
          onChange={pick("profile")}
          options={[{ value: INHERIT, label: `From Global (${globalProfile})` }, ...PERMISSION_PROFILES.map((profile) => ({ value: profile.id, label: profile.id }))]}
          description={`${profileHint(draft.profile ?? globalProfile)} The ${DENYLIST_RULES}-rule denylist is checked first.`}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={gitText} onCheckedChange={(checked) => setGitText(checked === true)} />
          Write commit messages and pull request descriptions with {agent.name}
        </label>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            saveDefaults(id, draft, gitText)
            onDone()
          }}
        >
          Save defaults
        </Button>
      </DialogFooter>
    </>
  )
}

function GlobalForm({ onDone }: { onDone: () => void }) {
  const stored = useAgentsStore(useShallow((state) => ({ profile: state.profile, gitTextAgent: state.gitTextAgent, autoName: state.autoName })))
  const agents = useAgentsStore((state) => state.agents)
  const saveGlobal = useAgentsStore((state) => state.saveGlobal)
  const [profile, setProfile] = useState(stored.profile)
  const [gitText, setGitText] = useState<AgentId>(stored.gitTextAgent)
  const [autoName, setAutoName] = useState(stored.autoName)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Global defaults</DialogTitle>
        <DialogDescription>Every agent inherits these unless its own defaults say otherwise.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Choice
          label="Permission profile"
          value={profile}
          onChange={setProfile}
          options={PERMISSION_PROFILES.map((entry) => ({ value: entry.id, label: entry.id }))}
          description={`${profileHint(profile)} The ${DENYLIST_RULES}-rule denylist is checked before any allowlist, in every profile.`}
        />
        <Choice
          label="Commit and pull request text"
          value={gitText}
          onChange={(value) => setGitText(value as AgentId)}
          options={agents.filter((agent) => agent.status === "ready").map((agent) => ({ value: agent.id, label: agent.name }))}
          description="Drafts commit messages and pull request descriptions from the diff, only when you ask."
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={autoName} onCheckedChange={(checked) => setAutoName(checked === true)} />
          Give new tasks a short title, written by that agent
        </label>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            saveGlobal(profile, gitText, autoName)
            onDone()
          }}
        >
          Save defaults
        </Button>
      </DialogFooter>
    </>
  )
}

/** One dialog for an agent's own defaults or the global ones every agent inherits. */
export function DefaultsDialog({ target, onOpenChange }: { target: AgentId | "global" | null; onOpenChange: (open: boolean) => void }) {
  const close = () => onOpenChange(false)
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {target === "global" ? <GlobalForm onDone={close} /> : target ? <AgentForm key={target} id={target} onDone={close} /> : null}
      </DialogContent>
    </Dialog>
  )
}
