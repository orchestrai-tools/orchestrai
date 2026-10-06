import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PROJECTS } from "@/lib/projects"
import { Choice, ConfirmDialog, Group, Row, SectionHeader, SelectMenu, SwitchRow } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"

const TRIGGERS = [
  { value: "manual", label: "By hand" },
  { value: "cron", label: "On a schedule" },
  { value: "idle", label: "When idle" },
] as const

type Trigger = (typeof TRIGGERS)[number]["value"]

export function MemorySection() {
  const [search, setSearch] = useAppSetting<"keywords" | "hybrid">("memory.search", "keywords")
  const [global, setGlobal] = useAppSetting("memory.global", true)
  const [perProject, setPerProject] = useAppSetting("memory.project", true)
  const [dreaming, setDreaming] = useAppSetting("memory.dreaming", false)
  const [trigger, setTrigger] = useAppSetting<Trigger>("memory.trigger", "manual")
  const [cron, setCron] = useAppSetting("memory.cron", "0 3 * * *")
  const [idle, setIdle] = useAppSetting("memory.idle", "30m")
  const [scope, setScope] = useState("global")
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  return (
    <>
      <SectionHeader
        title="Memory"
        scope="Durable facts agents store and search, shared across agents. Saved in ~/.warpforge/config.yaml; scopes apply after the daemon restarts."
      />

      <Group title="Search" note="Project memory is written only after a task's pull request merges, and the next task gets a short ranked slice of it.">
        <Row
          title={search === "hybrid" ? "Keywords and meaning" : "Keywords"}
          description={
            search === "hybrid"
              ? "Hybrid search. Falls back to keywords when offline."
              : "Full-text search. Hybrid adds meaning with a local model of about 80 MB."
          }
          control={
            <Choice
              label="Memory search"
              value={search}
              onChange={(next) => (next === "hybrid" ? setConfirming(true) : setSearch(next))}
              options={[
                { value: "keywords", label: "Keywords" },
                { value: "hybrid", label: "Hybrid" },
              ]}
            />
          }
        />
        <SwitchRow title="Global memory" description="214 facts any project's agents may read and add to." checked={global} onChange={setGlobal} />
        <SwitchRow title="Project memory" description="38 facts in orchestrai, 22 in payments-api, 12 in acme-web, kept apart." checked={perProject} onChange={setPerProject} />
      </Group>

      <Group title="Dreaming" note="Findings become pending proposals. A follow-up task checks each against the code, and nothing is applied without you.">
        <SwitchRow title="Dream automatically" description="Sweeps memory for duplicates, contradictions, and stale facts." checked={dreaming} onChange={setDreaming} />
        {dreaming && (
          <Row
            title="When"
            description={trigger === "cron" ? "A cron expression, in your time zone." : trigger === "idle" ? "After the app has been idle this long." : "Only when you run it below."}
            control={
              <>
                {trigger === "cron" && <Input value={cron} onChange={(event) => setCron(event.target.value)} aria-label="Schedule" className="h-7 w-28 font-mono text-xs md:text-xs" />}
                {trigger === "idle" && <Input value={idle} onChange={(event) => setIdle(event.target.value)} aria-label="Idle after" className="h-7 w-20 font-mono text-xs md:text-xs" />}
                <Choice label="Dreaming trigger" value={trigger} onChange={setTrigger} options={TRIGGERS} />
              </>
            }
          />
        )}
        <Row
          title="Dream now"
          description="Runs one sweep with Goose, since OpenCode is not installed. A dry run reports what it would propose and writes nothing."
          control={
            <>
              <SelectMenu
                label="Memory to sweep"
                value={scope}
                onChange={setScope}
                options={[{ value: "global", label: "Global" }, ...PROJECTS.map((project) => ({ value: project.id, label: project.name }))]}
              />
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setResult("Dry run: would propose 3 merges and flag 1 stale fact.")}>
                Dry run
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setResult("Dreamed: 4 proposals pending; a task is checking them against the code.")}>
                Dream
              </Button>
            </>
          }
        >
          {result && (
            <p className="text-xs text-muted-foreground" role="status">
              {result}
            </p>
          )}
        </Row>
      </Group>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Switch to hybrid search?"
        description="Downloads an 80 MB model (all-MiniLM-L6-v2) on first use and needs ONNX Runtime (brew install onnxruntime). Searches fall back to keywords offline."
        confirmLabel="Switch to hybrid"
        tone="default"
        onConfirm={() => setSearch("hybrid")}
      />
    </>
  )
}
