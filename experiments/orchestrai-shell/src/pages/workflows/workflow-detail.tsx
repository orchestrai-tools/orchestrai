import { useState, type ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { blockedPins, workflowFile, type Workflow } from "@/data/workflows"
import { useAppActions } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { StepList } from "@/pages/workflows/step-list"
import { EndingSection, ParametersSection, RecentRuns } from "@/pages/workflows/workflow-sections"
import { workflowYaml } from "@/pages/workflows/workflow-yaml"
import { YamlEditor, YamlView } from "@/pages/workflows/yaml-view"

export type WorkflowView = "steps" | "yaml"

function Notice({ tone, children }: { tone: "warn" | "error"; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs">
      <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full", tone === "warn" ? "bg-amber-500" : "bg-red-500")} />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

export function WorkflowDetail({
  workflow,
  project,
  view,
  onViewChange,
  draft,
  onSaveDraft,
  onRun,
  onDuplicate,
  onCopyToProject,
  onDelete,
}: {
  workflow: Workflow
  project: ProjectId
  view: WorkflowView
  onViewChange: (view: WorkflowView) => void
  draft: string | undefined
  onSaveDraft: (text: string) => void
  onRun: () => void
  onDuplicate: () => void
  onCopyToProject: () => void
  onDelete: () => void
}) {
  const { setPage } = useAppActions()
  const [editing, setEditing] = useState(false)
  const builtin = workflow.source === "builtin"
  const invalid = Boolean(workflow.error)
  const shown: WorkflowView = invalid || editing ? "yaml" : view
  const yaml = draft ?? workflowYaml(workflow)
  const file = workflowFile(workflow)
  const blocked = blockedPins(workflow)

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{workflow.name}</h2>
            {workflow.description && <p className="text-sm text-muted-foreground">{workflow.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{file}</span>
              {workflow.overrides && " · hides the built-in"}
              {draft ? " · edited just now" : workflow.edited && ` · edited ${workflow.edited}`}
            </p>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={shown}
            onValueChange={(next) => next && onViewChange(next as WorkflowView)}
            aria-label="Show as"
          >
            <ToggleGroupItem value="steps" disabled={invalid || editing}>
              Steps
            </ToggleGroupItem>
            <ToggleGroupItem value="yaml">YAML</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRun} disabled={invalid} title={invalid ? "Fix the file first; it does not load" : "Start a task that runs this workflow"}>
            Run as task
          </Button>
          {builtin ? (
            <Button size="sm" variant="outline" onClick={onCopyToProject} title="Built-ins ship with the app. The copy in .warpforge/workflows/ hides this one and can be edited.">
              Copy to project to edit
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={editing} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onDuplicate} disabled={invalid}>
            Duplicate
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${workflow.name}`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(yaml)}>Copy YAML</DropdownMenuItem>
              {!builtin && <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(file)}>Copy file path</DropdownMenuItem>}
              {!builtin && <DropdownMenuItem>Open in editor</DropdownMenuItem>}
              {!builtin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    Delete file…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(invalid || workflow.warnings?.length || blocked.length > 0) && (
          <div className="flex flex-col gap-1.5">
            {invalid && (
              <Notice tone="error">
                Can't load: <span className="font-mono">{workflow.error}</span>. It stays listed so the reason is visible; fix the file to
                run it.
              </Notice>
            )}
            {workflow.warnings?.map((warning) => (
              <Notice key={warning} tone="warn">
                {warning}
              </Notice>
            ))}
            {blocked.map((pin) => (
              <Notice key={`${pin.step}-${pin.agent}`} tone="warn">
                {pin.step} pins {pin.info.name}, which is {pin.info.status === "missing" ? "not installed" : "not signed in"}, so a run would
                stop at that step.{" "}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setPage("agents")}>
                  Open Agents
                </button>{" "}
                to set it up, or pin another agent.
              </Notice>
            ))}
          </div>
        )}
      </header>

      {shown === "steps" ? (
        <>
          <StepList workflow={workflow} />
          <EndingSection workflow={workflow} />
          <ParametersSection workflow={workflow} />
        </>
      ) : editing ? (
        <YamlEditor
          file={file}
          initial={yaml}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            onSaveDraft(text)
            setEditing(false)
          }}
        />
      ) : (
        <YamlView text={yaml} />
      )}

      <RecentRuns workflow={workflow} project={project} />
    </article>
  )
}
