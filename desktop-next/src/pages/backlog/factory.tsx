import { daemon } from "@warpforge/daemon";
import type { BacklogItem, EntryRunLocation, RunnerEntry, WorkflowMeta } from "@warpforge/protocol";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { useDaemon } from "../../lib/use-daemon";
import { waitLabel } from "../../model/factory";
import { isClosed } from "./labels";
import type { Factory } from "./use-backlog";

const ENTRY_LOCATIONS: { value: EntryRunLocation; label: string; hint: string }[] = [
  { value: "default", label: "Project default", hint: "Where the Factory settings say new tasks run." },
  { value: "worktree", label: "Background copy", hint: "Each task gets its own worktree; several can run at once." },
  { value: "checkout", label: "Your project folder", hint: "One at a time, so the running dev services serve the change. Only on a clean tree." },
];

/** The workflows a Factory task can run, and the agents that can lead it. */
export function useFactoryChoices(project: string, open: boolean) {
  const agents = (useDaemon().snapshot.agents ?? []).filter((agent) => agent.enabled);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void daemon
      .workflowList(project)
      .then((rows) => !cancelled && setWorkflows(rows))
      .catch(() => !cancelled && setWorkflows([]));
    return () => {
      cancelled = true;
    };
  }, [project, open]);
  return { agents, workflows };
}

/** One line under the toolbar while the Factory holds work: how much, and why the next one is not starting. */
export function FactoryStrip({
  project,
  factory,
  onQueue,
  onSettings,
}: {
  project: string;
  factory: Factory;
  onQueue: () => void;
  onSettings: () => void;
}) {
  const { entries, status } = factory;
  const held = status?.checkout?.state === "held";
  if (!entries.length && !held) return null;
  const count = (state: RunnerEntry["state"]) => entries.filter((entry) => entry.state === state).length;
  const parts = [
    count("running") && `${count("running")} running`,
    count("delivering") && `${count("delivering")} opening a PR`,
    count("delivered") && `${count("delivered")} delivered`,
    count("queued") && `${count("queued")} queued`,
  ].filter(Boolean);
  const hold = count("queued") ? waitLabel(status?.hold) : null;
  const retryCheckout = () =>
    void daemon
      .runnerRetryCheckout(project)
      .then((next) => {
        factory.setStatus(next);
        toast.success("Tried the checkout again");
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not retry the checkout"));

  return (
    <div className="flex flex-col gap-1 px-4 pb-2 text-xs text-muted-foreground">
      <p className="flex min-w-0 items-center gap-2">
        <span className="font-medium text-foreground">Factory</span>
        {parts.length > 0 && <span>{parts.join(" · ")}</span>}
        {hold && <span className="truncate">· Waiting: {hold}</span>}
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onQueue}>
          Queue
        </Button>
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onSettings}>
          Factory settings
        </Button>
      </p>
      {held && (
        <p className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
          <span className="truncate">{status?.checkout?.heldReason ?? "The project folder is held by a Factory task."}</span>
          <Button variant="outline" size="xs" onClick={retryCheckout}>
            Retry checkout
          </Button>
        </p>
      )}
    </div>
  );
}

function skipReason(item: BacklogItem, entries: RunnerEntry[]): string | undefined {
  if (entries.some((entry) => entry.itemId === item.id)) return "already in the Factory";
  if (isClosed(item.status)) return "closed";
  return undefined;
}

/** Starts Factory tasks for items: each runs a workflow, commits, and opens a draft PR, under the project's limits. */
export function RunInFactoryDialog({
  project,
  items,
  factory,
  onClose,
  onStarted,
}: {
  project: string;
  items: BacklogItem[] | null;
  factory: Factory;
  onClose: () => void;
  onStarted: () => void;
}) {
  const open = items !== null;
  const { agents, workflows } = useFactoryChoices(project, open);
  const settings = factory.status?.settings;
  const [workflow, setWorkflow] = useState("");
  const [agent, setAgent] = useState("");
  const [location, setLocation] = useState<EntryRunLocation>("default");
  const [deliver, setDeliver] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setWorkflow(settings?.workflow ?? "");
      setAgent(settings?.agent ?? "");
      setLocation("default");
      setDeliver(true);
    }
  }
  const list = items ?? [];
  const startable = list.filter((item) => !skipReason(item, factory.entries));
  const hold = waitLabel(factory.status?.hold);
  const first = list[0];

  async function start() {
    setBusy(true);
    try {
      const result = await daemon.runnerEnqueue(
        project,
        startable.map((item) => item.id),
        { workflow: workflow || null, agent: agent || null, model: null, runLocation: location, deliver },
      );
      factory.setStatus(result.status);
      const started = result.created.filter((created) => created.started).length;
      const queued = result.created.length - started;
      const skipped = result.skipped.length ? ` · skipped ${result.skipped.map((skip) => `#${skip.number}`).join(", ")}` : "";
      toast.success(`${started ? `Started ${started}` : ""}${started && queued ? " · " : ""}${queued ? `Queued ${queued}` : ""}${skipped}`);
      onStarted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the Factory tasks");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {list.length === 1 && first ? `Start #${first.number} in the Factory` : `Start ${startable.length} Factory tasks`}
          </DialogTitle>
          <DialogDescription>
            {deliver
              ? hold
                ? `They queue by priority. Right now the Factory is waiting: ${hold}.`
                : "They queue by priority and start as slots free up."
              : "Without a pull request each one runs its workflow, and nothing is committed or pushed."}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/40 px-3 py-2 text-xs">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-0.5">
              <span className="w-16 shrink-0 font-mono text-muted-foreground">#{item.number}</span>
              <span className="truncate">{item.title}</span>
              {skipReason(item, factory.entries) && (
                <span className="ml-auto shrink-0 text-muted-foreground">skipped: {skipReason(item, factory.entries)}</span>
              )}
            </li>
          ))}
        </ul>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel>Workflow</FieldLabel>
            <SelectMenu
              label="Workflow"
              value={workflow}
              onChange={setWorkflow}
              options={[
                { value: "", label: "Project default" },
                ...workflows.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  hint: entry.valid ? (entry.stages ?? []).join(" → ") : (entry.error ?? "Can't load"),
                  disabled: !entry.valid,
                })),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel>Lead agent</FieldLabel>
            <SelectMenu
              label="Lead agent"
              value={agent}
              onChange={setAgent}
              options={[
                { value: "", label: "Project default" },
                ...agents.map((entry) => ({ value: entry.id, label: entry.displayName })),
              ]}
            />
            <FieldDescription className="text-xs">Stages the workflow pins to an agent keep their own.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Where it runs</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={location}
              onValueChange={(next) => next && setLocation(next as EntryRunLocation)}
              className="w-full"
            >
              {ENTRY_LOCATIONS.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value} className="flex-1 text-xs">
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">
              {ENTRY_LOCATIONS.find((entry) => entry.value === location)?.hint}
            </FieldDescription>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={deliver} onCheckedChange={(value) => setDeliver(value === true)} />
            Open a draft PR when done
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!startable.length || busy} onClick={() => void start()}>
            {deliver ? "Queue" : "Start"} {startable.length === 1 ? "1 task" : `${startable.length} tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
