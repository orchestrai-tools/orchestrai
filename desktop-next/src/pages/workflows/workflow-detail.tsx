import type { TaskInfo, WorkflowMeta } from "@warpforge/protocol";
import { PROJECT_DIR } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { MoreHorizontalIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { workflowNotes } from "../../lib/workflow-notes";
import { StepList } from "./step-list";
import { saveWorkflowFile, useWorkflowFile, workflowPath } from "./use-workflows";
import { EndingSection, RecentRuns, VariablesSection } from "./workflow-sections";
import { YamlEditor, YamlView } from "./yaml-view";

export type WorkflowView = "steps" | "yaml";

function Notice({ tone, children }: { tone: "warn" | "error"; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs">
      <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full", tone === "warn" ? "bg-amber-500" : "bg-red-500")} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const copy = (text: string, what: string) =>
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error(`Could not copy the ${what}`),
  );

/** One workflow: its stages or its YAML, what can be done with it, and the tasks that ran it. */
export function WorkflowDetail({
  project,
  workflow,
  runs,
  view,
  onViewChange,
  onRun,
  onCopyToProject,
  onDuplicate,
  onOpenInEditor,
  onDelete,
  onSaved,
  onOpenTask,
}: {
  project: string;
  workflow: WorkflowMeta;
  runs: TaskInfo[];
  view: WorkflowView;
  onViewChange: (view: WorkflowView) => void;
  onRun: () => void;
  onCopyToProject: () => void;
  onDuplicate: (yaml: string) => void;
  onOpenInEditor: () => void;
  onDelete: () => void;
  onSaved: () => void;
  onOpenTask: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const file = useWorkflowFile(project, workflow);
  const builtin = workflow.source === "builtin";
  const invalid = !workflow.valid;
  const path = workflowPath(workflow.id);
  const shown: WorkflowView = builtin ? "steps" : invalid || editing ? "yaml" : view;
  const notes = file.text !== null ? workflowNotes(file.text) : null;

  async function save(text: string) {
    setSaving(true);
    try {
      await saveWorkflowFile(project, workflow.id, text);
      file.setText(text);
      setEditing(false);
      toast.success(`Saved ${path}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the workflow");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{workflow.name}</h2>
            {workflow.description && <p className="text-sm text-muted-foreground">{workflow.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {builtin ? "Built in" : <span className="font-mono">{path}</span>}
              {workflow.maxRounds ? ` · ${workflow.maxRounds} review rounds` : ""}
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
            <ToggleGroupItem value="yaml" disabled={builtin} title={builtin ? "Copy it to the project to see and edit the file" : undefined}>
              YAML
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onRun}
            disabled={invalid}
            title={invalid ? "Fix the file first; it does not load" : "Start a task that runs this workflow"}
          >
            Run as task
          </Button>
          {builtin ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onCopyToProject}
              title={`Built-ins ship with the app. The copy in ${PROJECT_DIR}/workflows/ hides this one and can be edited.`}
            >
              Copy to project to edit
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={editing || file.text === null} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {!builtin && (
            <Button size="sm" variant="outline" disabled={file.text === null} onClick={() => file.text !== null && onDuplicate(file.text)}>
              Duplicate
            </Button>
          )}
          {!builtin && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${workflow.name}`}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem disabled={file.text === null} onSelect={() => copy(file.text ?? "", "YAML")}>
                  Copy YAML
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copy(path, "file path")}>Copy file path</DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenInEditor}>Open in editor</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete file…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {(invalid || workflow.warnings?.length || file.error) && (
          <div className="flex flex-col gap-1.5">
            {invalid && (
              <Notice tone="error">
                Can't load: <span className="font-mono">{workflow.error ?? "the file is not valid"}</span>. It stays listed so the reason
                is visible; fix the file to run it.
              </Notice>
            )}
            {workflow.warnings?.map((warning) => (
              <Notice key={warning} tone="warn">
                {warning}
              </Notice>
            ))}
            {file.error && (
              <Notice tone="error">
                {file.error}{" "}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={file.reload}>
                  Retry
                </button>
              </Notice>
            )}
          </div>
        )}
      </header>

      {shown === "steps" ? (
        <>
          <StepList workflow={workflow} notes={notes} />
          <VariablesSection notes={notes} />
          <EndingSection />
        </>
      ) : editing && file.text !== null ? (
        <YamlEditor file={path} initial={file.text} busy={saving} onCancel={() => setEditing(false)} onSave={(text) => void save(text)} />
      ) : file.text !== null ? (
        <YamlView text={file.text} />
      ) : (
        !file.error && <p className="text-xs text-muted-foreground">Reading {path}…</p>
      )}

      <RecentRuns runs={runs} onOpen={onOpenTask} />
    </article>
  );
}
