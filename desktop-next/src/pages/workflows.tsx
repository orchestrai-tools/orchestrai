import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { WorkflowMeta } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { PageBody, PageToolbar } from "../components/common/page-toolbar";
import { useTaskDraft } from "../lib/new-task";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import {
  deleteWorkflowFile,
  renameYaml,
  saveWorkflowFile,
  uniqueId,
  useWorkflowList,
  workflowPath,
} from "./workflows/use-workflows";
import { WorkflowDetail, type WorkflowView } from "./workflows/workflow-detail";
import { WorkflowList } from "./workflows/workflow-list";

/** Reusable recipes. A workflow is never a run: a task runs one, and an automation starts tasks that do. */
export function Workflows() {
  const project = useShell((state) => state.project);
  if (!project) {
    return (
      <PageBody>
        <PageToolbar title="Workflows" />
        <p className="text-sm text-muted-foreground">Open a project to see its workflows.</p>
      </PageBody>
    );
  }
  return <ProjectWorkflows key={project} project={project} />;
}

function ProjectWorkflows({ project }: { project: string }) {
  const { rows, loading, error, reload } = useWorkflowList(project);
  const tasks = useDaemon().snapshot.tasks;
  const openTask = useShell((state) => state.openTask);
  const setFileJump = useShell((state) => state.setFileJump);
  const [selectedId, setSelectedId] = useState<string>();
  const [view, setView] = useState<WorkflowView>("steps");
  const [deleting, setDeleting] = useState<WorkflowMeta | null>(null);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const broken = rows.filter((row) => !row.valid).length;
  const builtins = rows.filter((row) => row.source === "builtin");
  const runsOf = (id: string) => tasks.filter((task) => task.project === project && task.workflowRun?.workflowId === id);

  const eject = (workflow: WorkflowMeta) =>
    void daemon
      .workflowEject(project, workflow.id)
      .then(async (path) => {
        toast.success(`Copied into ${path}`);
        await reload();
        setSelectedId(workflow.id);
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not copy the workflow"));

  const duplicate = (workflow: WorkflowMeta, yaml: string) => {
    const id = uniqueId(`${workflow.id}-copy`, rows);
    void saveWorkflowFile(project, id, renameYaml(yaml, `${workflow.name} (copy)`))
      .then(async () => {
        toast.success(`Created ${workflowPath(id)}`);
        await reload();
        setSelectedId(id);
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not duplicate the workflow"));
  };

  const remove = (workflow: WorkflowMeta) =>
    void deleteWorkflowFile(project, workflow.id)
      .then(async () => {
        toast.success(`Deleted ${workflowPath(workflow.id)}`);
        setSelectedId(undefined);
        await reload();
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not delete the workflow"));

  const overridesBuiltin = (workflow: WorkflowMeta) => builtins.some((row) => row.id === workflow.id);

  return (
    <div className="@container flex flex-col gap-4 p-4">
      <PageToolbar
        title="Workflows"
        meta={rows.length ? `${rows.length - broken} recipes${broken ? ` · ${broken} can't load` : ""}` : undefined}
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!builtins.length}>
              New workflow <ChevronDownIcon className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Start from a built-in</DropdownMenuLabel>
            {builtins.map((builtin) => (
              <DropdownMenuItem key={builtin.id} disabled={!builtin.valid} onSelect={() => eject(builtin)}>
                {builtin.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          {error}
          <Button size="xs" variant="outline" onClick={() => void reload()}>
            Retry
          </Button>
        </p>
      )}
      {loading && rows.length === 0 && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading workflows">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-64" />
          ))}
        </div>
      )}
      {!loading && rows.length === 0 && !error && <p className="text-sm text-muted-foreground">No workflows.</p>}

      {rows.length > 0 && (
        <div className="grid gap-6 @3xl:grid-cols-[16rem_minmax(0,1fr)]">
          <WorkflowList
            workflows={rows}
            runsOf={runsOf}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            className="@3xl:sticky @3xl:top-4 @3xl:self-start"
          />
          {selected && (
            <WorkflowDetail
              key={`${selected.source}-${selected.id}`}
              project={project}
              workflow={selected}
              runs={runsOf(selected.id)}
              view={view}
              onViewChange={setView}
              onRun={() => useTaskDraft.getState().open("", selected.id)}
              onCopyToProject={() => eject(selected)}
              onDuplicate={(yaml) => duplicate(selected, yaml)}
              onOpenInEditor={() => setFileJump({ path: workflowPath(selected.id), line: 1 })}
              onDelete={() => setDeleting(selected)}
              onSaved={() => void reload()}
              onOpenTask={(id) => openTask(id, project)}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.id ?? ""}.yaml?`}
        description={
          deleting
            ? `The file leaves ${PROJECT_DIR}/workflows/.${overridesBuiltin(deleting) ? ` The built-in ${deleting.name} shows again.` : ""} Tasks that ran it keep their history.`
            : ""
        }
        confirmLabel="Delete file"
        tone="destructive"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  );
}
