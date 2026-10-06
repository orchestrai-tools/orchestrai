import { useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DECISION_LABEL, evaluate, TOOL_KINDS, type Decision, type PermissionProfile } from "@/data/settings"
import { cn } from "@/lib/utils"
import { Choice, Group, Row } from "@/pages/settings/primitives"

const DECISIONS = (Object.keys(DECISION_LABEL) as Decision[]).map((value) => ({ value, label: DECISION_LABEL[value] }))

const VERDICT = {
  deny: { label: "Refused", tone: "text-red-600 dark:text-red-400" },
  allow: { label: "Runs", tone: "text-emerald-700 dark:text-emerald-400" },
  ask: { label: "Asks", tone: "text-amber-700 dark:text-amber-400" },
  agent: { label: "Agent decides", tone: "text-muted-foreground" },
}

function PatternList({
  label,
  description,
  patterns,
  editable,
  onChange,
}: {
  label: string
  description: string
  patterns: string[]
  editable: boolean
  onChange: (patterns: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  return (
    <Row title={label} description={description}>
      <div className="flex flex-wrap gap-1">
        {patterns.map((pattern) => (
          <span key={pattern} className={cn("inline-flex h-6 items-center gap-1 rounded-sm border px-2 font-mono text-xs", editable && "pr-0")}>
            {pattern}
            {editable && (
              <Button variant="ghost" size="icon-xs" className="size-5" aria-label={`Remove ${pattern}`} onClick={() => onChange(patterns.filter((entry) => entry !== pattern))}>
                <XIcon />
              </Button>
            )}
          </span>
        ))}
        {patterns.length === 0 && <span className="text-xs text-muted-foreground">Empty.</span>}
      </div>
      {editable && (
        <form
          className="flex items-center gap-2 pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim() || patterns.includes(draft.trim())) return
            onChange([...patterns, draft.trim()])
            setDraft("")
          }}
        >
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="git push origin feat-*" aria-label={`Add to ${label}`} className="h-7 w-64 font-mono text-xs md:text-xs" />
          <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      )}
    </Row>
  )
}

/** Try a command against the profile before an agent does. */
function CommandTester({ profile }: { profile: PermissionProfile }) {
  const [command, setCommand] = useState("git push --force origin orc-10-permission-profiles")
  const result = command.trim() ? evaluate(profile, command) : null
  return (
    <Row title="Try a command" description="See what this profile does with it, in the order the checks run.">
      <Input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Command to test" className="h-7 font-mono text-xs md:text-xs" />
      {result && (
        <p className="pt-2 text-xs" role="status">
          <span className={cn("font-medium", VERDICT[result.verdict].tone)}>{VERDICT[result.verdict].label}.</span>{" "}
          <span className="text-muted-foreground">{result.reason}</span>
        </p>
      )}
    </Row>
  )
}

export function ProfileEditor({ profile, onChange }: { profile: PermissionProfile; onChange: (patch: Partial<PermissionProfile>) => void }) {
  const editable = !profile.builtIn
  return (
    <>
      <Group
        title={`${profile.name}: by kind of tool call`}
        note={editable ? undefined : "Built-in profiles cannot be edited. Duplicate one to change it."}
      >
        {TOOL_KINDS.map((kind) => (
          <Row
            key={kind.id}
            title={kind.label}
            description={kind.hint}
            control={
              <Choice
                label={kind.label}
                value={profile.decisions[kind.id]}
                options={DECISIONS}
                disabled={!editable}
                onChange={(decision) => onChange({ decisions: { ...profile.decisions, [kind.id]: decision } })}
              />
            }
          />
        ))}
      </Group>
      <Group title="Command lists" note="Checked in this order: the denylist, then the allowlist, then the kind above. * matches anything.">
        <PatternList
          label="Denylist"
          description="Refused outright, even if the allowlist also matches."
          patterns={profile.denylist}
          editable={editable}
          onChange={(denylist) => onChange({ denylist })}
        />
        <PatternList
          label="Allowlist"
          description="Runs without asking."
          patterns={profile.allowlist}
          editable={editable}
          onChange={(allowlist) => onChange({ allowlist })}
        />
        <CommandTester profile={profile} />
      </Group>
    </>
  )
}
