import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { STORAGE } from "@/data/settings"
import { TERMINALS } from "@/data/terminals"
import { useAppActions } from "@/lib/app-instance"
import type { Project } from "@/lib/projects"
import { useRuntime, useRuntimeStore } from "@/pages/services/runtime-store"
import { ConfirmDialog, Group, Row, SectionHeader } from "@/pages/settings/primitives"

const PARTS = [
  { id: "transcripts", label: "Transcripts and plans", hint: "as markdown, one folder per task" },
  { id: "backlog", label: "Backlog", hint: "as JSON and YAML" },
  { id: "memory", label: "Project memory", hint: "as JSON with sources" },
  { id: "settings", label: "Settings", hint: "profiles, defaults, notifications" },
] as const

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

export function DataSection({ project }: { project: Project }) {
  const runtime = useRuntime(project.id)
  const { closeProject } = useAppActions()
  const id = useId()
  const [parts, setParts] = useState<string[]>(PARTS.map((part) => part.id))
  const [exported, setExported] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const services = runtime.services.filter((svc) => svc.status === "running" || svc.status === "starting").length
  const forwards = runtime.forwards.filter((pf) => pf.status === "active" || pf.status === "starting").length
  const terminals = TERMINALS[project.id].filter((terminal) => terminal.status !== "exited").length
  const live = [services && plural(services, "running service"), forwards && plural(forwards, "port-forward"), terminals && plural(terminals, "live terminal")].filter(Boolean)

  return (
    <>
      <SectionHeader title="Data" scope="Everything OrchestrAI keeps about this project, how to take it with you, and how to leave cleanly." />

      <Group title="Stored on this Mac" note="Workspace config, workflows, and docs live in the repository. They are your files, and nothing here deletes them.">
        {STORAGE[project.id].map((entry) => (
          <Row
            key={entry.label}
            title={entry.label}
            description={deleted ? "Deleted" : entry.detail}
            control={<span className="text-xs tabular-nums">{deleted ? "0 B" : entry.size}</span>}
          />
        ))}
      </Group>

      <Group title="Export">
        <Row
          title="Export this project"
          description="One archive in your Downloads folder. Nothing is uploaded."
          control={
            <Button variant="outline" size="sm" className="text-xs" disabled={!parts.length} onClick={() => setExported(true)}>
              Export
            </Button>
          }
        >
          <div className="flex flex-col gap-1.5">
            {PARTS.map((part) => (
              <label key={part.id} htmlFor={`${id}-${part.id}`} className="flex items-center gap-2 text-xs">
                <Checkbox
                  id={`${id}-${part.id}`}
                  checked={parts.includes(part.id)}
                  onCheckedChange={(checked) => setParts(checked ? [...parts, part.id] : parts.filter((entry) => entry !== part.id))}
                />
                <span className="font-medium">{part.label}</span>
                <span className="text-muted-foreground">{part.hint}</span>
              </label>
            ))}
          </div>
          {exported && (
            <p className="pt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
              Saved ~/Downloads/{project.id}-export-2026-10-01.zip
            </p>
          )}
        </Row>
      </Group>

      <Group title="Leave">
        <Row
          title="Remove from OrchestrAI"
          description="Stops what is running and takes the project off the list. The folder, its files, and its history stay."
          control={
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setRemoving(true)}>
              Remove…
            </Button>
          }
        />
        <Row
          title="Delete project data"
          description="Deletes transcripts, task worktrees, project memory, and the backlog for good. Commits and pushed branches stay in git."
          control={
            <Button variant="destructive" size="sm" className="text-xs" onClick={() => setDeleting(true)} disabled={deleted}>
              Delete…
            </Button>
          }
        />
      </Group>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${project.name}?`}
        description="It leaves OrchestrAI's project list. The folder and files are not touched, and adding it again brings its history back."
        confirmLabel={live.length ? "Stop and remove" : "Remove project"}
        onConfirm={() => {
          useRuntimeStore.getState().stopAll(project.id)
          closeProject(project.id)
        }}
      >
        {live.length > 0 && (
          <div className="text-xs">
            <p className="font-medium">Stops first</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {live.map((entry) => (
                <li key={String(entry)}>{entry}</li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete everything OrchestrAI keeps for ${project.name}?`}
        description="Transcripts, task worktrees with uncommitted work, project memory, and the backlog are deleted and cannot be restored. Export first if you might want them."
        confirmLabel="Delete project data"
        typed={project.name}
        onConfirm={() => setDeleted(true)}
      />
    </>
  )
}
