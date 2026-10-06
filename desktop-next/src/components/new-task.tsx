import { daemon } from "@warpforge/daemon";
import type { EntryRunLocation, ExternalSession } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Textarea } from "@warpforge/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { linkedWorkItem, runPlace, useTaskDraft, type DraftWorkItem } from "../lib/new-task";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { SelectMenu } from "./common/select-menu";
import { FactoryFields } from "./new-task/factory-fields";
import type { BatchScope } from "./new-task/factory-batch";
import { runPreview } from "./new-task/run-preview";
import { ContinueSessions } from "./new-task/sessions";
import { SingleFields } from "./new-task/single-fields";
import { startNewTask, type Mode } from "./new-task/submit";
import { useNewTaskOptions } from "./new-task/use-options";

const MODES: readonly { id: Mode; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "orchestrator", label: "Orchestrator" },
  { id: "factory", label: "Factory" },
];

const FALLBACK_AGENTS = [
  { id: "claude", displayName: "claude" },
  { id: "codex", displayName: "codex" },
];

/**
 * A task is one run: a goal, an agent, and where it runs. Single runs one
 * agent, Orchestrator hands pieces to others, Factory runs a workflow and can
 * queue a backlog batch.
 */
export function NewTaskDialog() {
  const shell = useShell();
  const state = useDaemon();
  const [prompt, setPrompt] = useState("");
  const [agent, setAgent] = useState("claude");
  const [mode, setMode] = useState<Mode>("single");
  const [base, setBase] = useState("");
  const [shareServices, setShareServices] = useState(true);
  const [advisorOn, setAdvisorOn] = useState(false);
  const [advisorAgent, setAdvisorAgent] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [deliver, setDeliver] = useState(true);
  const [location, setLocation] = useState<EntryRunLocation>("default");
  const [batch, setBatch] = useState<string[]>([]);
  const [scope, setScope] = useState<BatchScope>({
    all: false,
    total: 0,
    search: "",
    status: "todo",
    source: "all",
  });
  const [workItem, setWorkItem] = useState<DraftWorkItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const goalId = useId();
  const tagsId = useId();
  const project = shell.project ?? state.snapshot.projects[0]?.name;
  const worktree = shell.newTaskWorktree;
  const enabled = (state.snapshot.agents ?? []).filter((item) => item.enabled);
  const agents = enabled.length > 0 ? enabled : FALLBACK_AGENTS;
  const models = enabled.find((item) => item.id === agent)?.models ?? [];
  const running = state.snapshot.services.filter(
    (service) =>
      service.project === project && service.status === "running" && service.allocatedPort > 0,
  );
  const { workflows, sessions, branches, loadError, retry } = useNewTaskOptions(
    shell.newTask,
    project,
    worktree,
  );
  const draftId = useTaskDraft((draft) => draft.id);

  useEffect(() => {
    if (!draftId) return;
    const draft = useTaskDraft.getState();
    if (draft.text) setPrompt(draft.text);
    setWorkItem(draft.workItem);
    if (draft.workflowId) {
      setMode("factory");
      setWorkflow(draft.workflowId);
    }
    if (!useShell.getState().newTask) useShell.getState().toggle("newTask");
  }, [draftId]);

  const close = () => {
    setWorkItem(null);
    if (useShell.getState().newTask) useShell.getState().toggle("newTask");
  };
  const workItemId = linkedWorkItem(workItem, project);
  const selectedWorkflow = workflows.find((item) => item.id === workflow) ?? null;
  const batchCount = scope.all ? scope.total : batch.length;
  const batching = mode === "factory" && deliver && batchCount > 0;
  const canStart = Boolean(project) && !busy && (batching || Boolean(prompt.trim()));
  const place = runPlace({
    mode,
    worktree: worktree && mode === "single",
    base,
    location,
    tests: selectedWorkflow?.verifyRequired != null,
  });

  async function submit() {
    if (!project || !canStart) return;
    setError(null);
    setBusy(true);
    try {
      const result = await startNewTask({
        project,
        prompt,
        agent,
        models,
        picks,
        mode,
        tags,
        worktree,
        base,
        shareServices,
        advisor: advisorOn && advisorAgent ? advisorAgent : null,
        workflow,
        deliver,
        location,
        batch,
        scope,
        workItemId,
      });
      if (result.kind === "refused") {
        setError(result.message);
        return;
      }
      setPrompt("");
      close();
      if (result.kind === "queued") {
        toast.success(`Queued ${result.count} in Factory`);
        setBatch([]);
        if (result.firstTaskId) shell.openTask(result.firstTaskId, project);
      } else {
        if (result.linkError)
          toast.error("Task started, but linking it to the backlog item failed", {
            description: result.linkError,
          });
        shell.openTask(result.taskId, project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task was not created");
    } finally {
      setBusy(false);
    }
  }

  async function resume(session: ExternalSession) {
    if (!project) return;
    try {
      const id = await daemon.resumeTask(project, session.agent, session.sessionId, session.title);
      close();
      if (id) shell.openTask(id, project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue that session");
    }
  }

  const startLabel = batching
    ? `Start ${batchCount} in Factory`
    : mode === "factory" && deliver
      ? "Start in Factory"
      : mode === "orchestrator"
        ? "Start orchestrator"
        : "Start task";

  return (
    <Dialog open={shell.newTask} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {state.snapshot.projects.length > 1 || !project
                ? "New task"
                : `New task in ${project}`}
            </DialogTitle>
            <DialogDescription>
              {project ? place : "Add a project first."}
              {workItemId && workItem ? ` Linked to backlog item #${workItem.number}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5">
            {state.snapshot.projects.length > 1 && (
              <Field>
                <FieldLabel>Project</FieldLabel>
                <SelectMenu
                  label="Project"
                  value={project ?? ""}
                  options={state.snapshot.projects.map((item) => ({
                    value: item.name,
                    label: item.name,
                    hint: item.path,
                  }))}
                  onChange={(name) => shell.openProject(name)}
                  className="w-full"
                />
              </Field>
            )}
            <Field>
              <FieldLabel>Mode</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={mode}
                onValueChange={(next) => next && setMode(next as Mode)}
                aria-label="Execution mode"
                className="w-full"
              >
                {MODES.map((entry) => {
                  const off = entry.id === "factory" && workflows.length === 0;
                  return (
                    <ToggleGroupItem
                      key={entry.id}
                      value={entry.id}
                      disabled={off}
                      title={off ? "No pipelines defined in this project" : undefined}
                      className="flex-1"
                    >
                      {entry.label}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor={goalId}>Goal</FieldLabel>
              <Textarea
                id={goalId}
                autoFocus
                rows={4}
                value={prompt}
                placeholder={
                  mode === "orchestrator"
                    ? "What should the orchestrator coordinate?"
                    : "What should be true when this is done?"
                }
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.metaKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Agent</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={agent}
                onValueChange={(next) => next && setAgent(next)}
                className="w-full"
              >
                {agents.map((item) => (
                  <ToggleGroupItem key={item.id} value={item.id} className="flex-1">
                    {item.displayName}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {models.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {models.map((option) => (
                    <SelectMenu
                      key={option.id}
                      label={option.name}
                      value={picks[option.id] ?? option.currentValue}
                      options={option.options.map((choice) => ({
                        value: choice.value,
                        label: choice.name,
                      }))}
                      onChange={(value) =>
                        setPicks((current) => ({ ...current, [option.id]: value }))
                      }
                      className="w-full"
                    />
                  ))}
                </div>
              )}
              <FieldDescription>
                {runPreview({
                  mode,
                  agent,
                  deliver,
                  workflow: mode === "factory" ? selectedWorkflow : null,
                })}
              </FieldDescription>
            </Field>
            {mode === "single" && (
              <SingleFields
                worktree={worktree}
                onWorktree={shell.setNewTaskWorktree}
                base={base}
                onBase={setBase}
                branches={branches}
                advisorOn={advisorOn}
                onAdvisorOn={setAdvisorOn}
                advisor={advisorAgent}
                onAdvisor={setAdvisorAgent}
                agents={agents}
              />
            )}
            {mode === "factory" && project && (
              <FactoryFields
                project={project}
                workflows={workflows}
                workflow={workflow}
                onWorkflow={setWorkflow}
                deliver={deliver}
                onDeliver={setDeliver}
                location={location}
                onLocation={setLocation}
                batch={batch}
                onBatch={setBatch}
                onScope={setScope}
              />
            )}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
              <label
                className="flex items-center gap-2 text-sm"
                title={
                  running.map((service) => `${service.name}:${service.allocatedPort}`).join(", ") ||
                  "No services running"
                }
              >
                <Checkbox
                  checked={shareServices}
                  onCheckedChange={(on) => setShareServices(on === true)}
                />
                Services{running.length > 0 ? ` (${running.length} running)` : ""}
              </label>
              <Input
                id={tagsId}
                aria-label="Tags"
                value={tags}
                placeholder="Tags, comma separated"
                onChange={(event) => setTags(event.target.value)}
                className="h-7 text-xs md:text-xs"
              />
            </div>
            <ContinueSessions sessions={sessions} onResume={(session) => void resume(session)} />
            {loadError && (
              <FieldError className="flex items-center gap-2">
                {loadError}
                <Button type="button" variant="ghost" size="xs" onClick={retry}>
                  Retry
                </Button>
              </FieldError>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canStart}>
              {startLabel}{" "}
              <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                ⌘↵
              </Kbd>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
