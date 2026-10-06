import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { EXTRA_SHORTCUTS, VERSIONS } from "@/data/app-settings"
import { buildActions } from "@/lib/actions"
import { useAppActions } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import type { Project } from "@/lib/projects"
import { Group, Row, SectionHeader } from "@/pages/settings/primitives"

const GUIDES = [
  { title: "The workspace file", description: "Services, ports, port-forwards, worktrees, and local overrides, field by field." },
  { title: "Permission profiles and modes", description: "What asks, what runs, and why the denylist always wins." },
  { title: "Driving OrchestrAI from your phone", description: "Pairing, the relay, and what a phone can and cannot do." },
  { title: "Workflows, tasks, and automations", description: "How a recipe, a run, and a trigger fit together." },
]

function Keys({ keys }: { keys: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.split(" ").map((key, index) =>
        key === "/" ? (
          <span key={index} className="text-xs text-muted-foreground">
            or
          </span>
        ) : (
          <Kbd key={index} className="text-xs">
            {key}
          </Kbd>
        )
      )}
    </span>
  )
}

export function HelpSection({ project }: { project: Project }) {
  const { setPage } = useAppActions()
  const dialog = useDialog()
  const id = useId()
  const [summary, setSummary] = useState("")
  const [attach, setAttach] = useState(true)
  const [sent, setSent] = useState(false)
  const [checked, setChecked] = useState(false)
  const shortcuts = buildActions(project.id).filter((action) => action.shortcut)

  return (
    <>
      <SectionHeader title="Help" scope="Answers without leaving the app, and a way to reach a person when they are not enough." />

      <Group title="Find it">
        <Row
          title="Search every action"
          description="The command palette has everything the app can do, each with its shortcut."
          control={
            <Button variant="outline" size="sm" className="text-xs" onClick={() => dialog.open("palette")}>
              Open palette <Kbd className="text-xs">⌘K</Kbd>
            </Button>
          }
        />
        {GUIDES.map((guide) => (
          <Row
            key={guide.title}
            title={guide.title}
            description={guide.description}
            control={
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPage("docs")}>
                Read
              </Button>
            }
          />
        ))}
      </Group>

      <Group title="Keyboard shortcuts">
        {[...shortcuts.map((action) => ({ keys: action.shortcut ?? "", label: action.title })), ...EXTRA_SHORTCUTS].map((entry) => (
          <div key={`${entry.keys}-${entry.label}`} className="flex items-center gap-4 py-(--row-py) text-sm">
            <span className="min-w-0 flex-1">{entry.label}</span>
            <Keys keys={entry.keys} />
          </div>
        ))}
      </Group>

      <Group title="Report a problem" note="Opens a draft issue on github.com/orchestrai-tools/orchestrai for you to read and send. Nothing is sent from here.">
        <div className="flex flex-col gap-2 py-[calc(var(--row-py)+0.25rem)]">
          <Textarea
            value={summary}
            onChange={(event) => {
              setSummary(event.target.value)
              setSent(false)
            }}
            placeholder="What happened, and what did you expect?"
            aria-label="What happened"
            className="min-h-20 text-sm"
          />
          <label htmlFor={id} className="flex items-start gap-2 text-xs">
            <Checkbox id={id} checked={attach} onCheckedChange={(next) => setAttach(next === true)} className="mt-px" />
            <span>
              <span className="font-medium">Attach diagnostics</span>{" "}
              <span className="text-muted-foreground">versions, the last 500 daemon log lines, and settings with tokens removed. Never transcripts.</span>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" className="text-xs" disabled={!summary.trim()} onClick={() => setSent(true)}>
              Draft an issue
            </Button>
            {sent && <span className="text-xs text-muted-foreground" role="status">Draft opened in your browser.</span>}
          </div>
        </div>
      </Group>

      <Group title="About">
        <Row
          title={`OrchestrAI ${VERSIONS.app}`}
          description={`Build ${VERSIONS.build} · daemon ${VERSIONS.daemon} · ${VERSIONS.acp}`}
          control={
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setChecked(true)} disabled={checked}>
              {checked ? "Up to date" : "Check for updates"}
            </Button>
          }
        />
      </Group>
    </>
  )
}
