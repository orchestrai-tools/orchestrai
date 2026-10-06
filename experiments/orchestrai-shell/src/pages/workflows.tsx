import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BUILTIN_WORKFLOWS, IMPLEMENT_NO_PLAN_PROMPT, fix, implement, review, type Workflow } from "@/data/workflows"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import type { ProjectId } from "@/lib/projects"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { automationsRunning, fileKey, listWorkflows, uniqueId } from "@/pages/workflows/model"
import { RunWorkflowDialog } from "@/pages/workflows/run-dialog"
import { WorkflowDetail, type WorkflowView } from "@/pages/workflows/workflow-detail"
import { WorkflowList } from "@/pages/workflows/workflow-list"

function blankWorkflow(project: ProjectId, id: string): Workflow {
  return {
    id,
    name: "Untitled workflow",
    description: "Say what this recipe is for, so the picker can tell it apart.",
    source: "project",
    projects: [project],
    edited: "Just now",
    parameters: [],
    ending: { mode: "goal", doneWhen: "The reviewer approves" },
    stops: ["merge"],
    steps: [
      implement({ prompt: IMPLEMENT_NO_PLAN_PROMPT }),
      review({ maxRounds: 3, onLimit: "ask", reask: "same_session", context: ["prompt", "implementer_summary", "diff"], reviewers: [{ focus: "correctness and edge cases" }] }),
      fix("review"),
    ],
  }
}

function deleteText(workflow: Workflow, project: ProjectId): string {
  const users = automationsRunning(workflow, project)
  const lines = [
    `The file leaves .warpforge/workflows/.${workflow.overrides ? ` The built-in ${workflow.name} shows again.` : ""}`,
    "Tasks that ran it keep their history.",
  ]
  if (users.length) {
    lines.push(`${users.map((automation) => automation.name).join(" and ")} run${users.length === 1 ? "s" : ""} it; until you pick another workflow, ${users.length === 1 ? "it skips" : "they skip"} with that reason.`)
  }
  return lines.join(" ")
}

/** Reusable recipes. A workflow is never a run: a task runs one, and an automation starts tasks that do. */
export function WorkflowsPage() {
  const project = useAppSession((session) => session.project)
  const [added, setAdded] = useState<Workflow[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const selectedId = useAppSession((session) => selectSelection(session, "workflow"))
  const { select } = useAppActions()
  const setSelectedId = (id: string) => select("workflow", id)
  const [view, setView] = useState<WorkflowView>("steps")
  const [running, setRunning] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState<Workflow | null>(null)

  const workflows = listWorkflows(project, added, removed)
  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? workflows[0]
  const broken = workflows.filter((workflow) => workflow.error).length

  const addFile = (workflow: Workflow) => {
    setAdded((current) => [...current, workflow])
    setSelectedId(workflow.id)
  }

  const duplicate = (source: Workflow) =>
    addFile({
      ...source,
      id: uniqueId(`${source.id}-copy`, workflows),
      name: `${source.name} (copy)`,
      source: "project",
      projects: [project],
      overrides: false,
      warnings: undefined,
      edited: "Just now",
    })

  const remove = (workflow: Workflow) => {
    const key = fileKey(project, workflow)
    if (added.includes(workflow)) setAdded((current) => current.filter((entry) => entry !== workflow))
    else setRemoved((current) => [...current, key])
    setDrafts(({ [key]: _dropped, ...rest }) => rest)
    setDeleting(null)
  }

  return (
    <div className="@container flex flex-col gap-4 p-4">
      <PageToolbar title="Workflows" meta={`${workflows.length - broken} recipes${broken ? ` · ${broken} can't load` : ""}`}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              New workflow <ChevronDownIcon className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => addFile(blankWorkflow(project, uniqueId("untitled", workflows)))}>Blank workflow</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Start from a built-in</DropdownMenuLabel>
            {BUILTIN_WORKFLOWS.map((builtin) => (
              <DropdownMenuItem key={builtin.id} onSelect={() => duplicate(builtin)}>
                {builtin.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      <div className="grid gap-6 @3xl:grid-cols-[16rem_minmax(0,1fr)]">
        <WorkflowList
          workflows={workflows}
          project={project}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          className="@3xl:sticky @3xl:top-4 @3xl:self-start"
        />
        {selected && (
          <WorkflowDetail
            key={fileKey(project, selected)}
            workflow={selected}
            project={project}
            view={view}
            onViewChange={setView}
            draft={drafts[fileKey(project, selected)]}
            onSaveDraft={(text) => setDrafts((current) => ({ ...current, [fileKey(project, selected)]: text }))}
            onRun={() => setRunning(selected)}
            onDuplicate={() => duplicate(selected)}
            onCopyToProject={() => addFile({ ...selected, source: "project", projects: [project], overrides: true, edited: "Just now" })}
            onDelete={() => setDeleting(selected)}
          />
        )}
      </div>

      <RunWorkflowDialog workflow={running} onClose={() => setRunning(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.id ?? ""}.yaml?`}
        description={deleting ? deleteText(deleting, project) : ""}
        confirmLabel="Delete file"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  )
}
