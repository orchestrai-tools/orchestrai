import { useState } from "react"

import { Button } from "@/components/ui/button"
import { VERSIONS } from "@/data/app-settings"
import { Choice, ConfirmDialog, Group, Row, SectionHeader, SelectMenu } from "@/pages/settings/primitives"
import { useAppSetting } from "@/pages/settings/settings-store"
import { useFlash } from "@/pages/settings/use-flash"

const LEVELS = ["error", "warn", "info", "debug", "trace"].map((value) => ({ value, label: value }))

export function AdvancedSection() {
  const [backlog, setBacklog] = useAppSetting<"sqlite" | "yaml">("advanced.backlog", "sqlite")
  const [level, setLevel] = useAppSetting("advanced.logLevel", "info")
  const [restarting, setRestarting] = useState(false)
  const [restarted, setRestarted] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [copied, flash] = useFlash()

  return (
    <>
      <SectionHeader title="Advanced" scope="Rarely needed. Every change here applies to all projects." />

      <Group title="Storage">
        <Row
          title="Backlog storage"
          description="SQLite stays in OrchestrAI's data folder. YAML files live in .warpforge/backlog and can be committed."
          control={
            <Choice
              label="Backlog storage"
              value={backlog}
              onChange={setBacklog}
              options={[
                { value: "sqlite", label: "SQLite" },
                { value: "yaml", label: "YAML files" },
              ]}
            />
          }
        />
      </Group>

      <Group title="Daemon" note="The daemon owns agent sessions, services, and terminals, so closing the window stops none of them.">
        <Row title="Address" description="Where the app, the terminal UI, and the MCP bridge connect." control={<code className="font-mono text-xs">{VERSIONS.endpoint}</code>} />
        <Row title="Running" description={restarted ? "pid 51877 · up just now · 5 projects · 7 agent sessions resumed" : "pid 48213 · up 2h 16m · 5 projects · 7 agent sessions"} />
        <Row title="Log level" description="How much the daemon writes to ~/.warpforge/daemon.log." control={<SelectMenu label="Log level" value={level} onChange={setLevel} options={LEVELS} />} />
        <Row
          title="Restart the daemon"
          description="Agent sessions resume from their transcripts afterwards; services start again where they start on open."
          control={
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setRestarting(true)}>
              Restart…
            </Button>
          }
        />
      </Group>

      <Group title="Diagnostics">
        <Row
          title="Copy diagnostics"
          description="Versions, the last 500 daemon log lines, and settings, with tokens taken out. Never transcripts."
          control={
            <Button
              variant="outline"
              size="sm" className="text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(`OrchestrAI ${VERSIONS.app} (${VERSIONS.build}) · daemon ${VERSIONS.daemon} · ${VERSIONS.acp}`)
                flash("Copied")
              }}
            >
              {copied ?? "Copy"}
            </Button>
          }
        />
      </Group>

      <Group title="Reset">
        <Row
          title="Reset OrchestrAI"
          description="Deletes ~/.warpforge: every project's registration, transcripts, memory, and settings. Repositories are not touched."
          control={
            <Button variant="destructive" size="sm" className="text-xs" onClick={() => setResetting(true)}>
              Reset…
            </Button>
          }
        />
      </Group>

      <ConfirmDialog
        open={restarting}
        onOpenChange={setRestarting}
        title="Restart the daemon?"
        description="Running agent turns stop mid-step and services restart. Every session can be continued from where its transcript ends."
        confirmLabel="Restart daemon"
        tone="default"
        onConfirm={() => setRestarted(true)}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Delete everything OrchestrAI keeps?"
        description="All five projects leave the list, and their transcripts, memory, worktrees, and settings are deleted. Export a project first under its Data section if you want to keep it."
        confirmLabel="Reset OrchestrAI"
        typed="reset"
        onConfirm={() => setResetting(false)}
      />
    </>
  )
}
