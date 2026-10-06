import { daemon } from "@warpforge/daemon";
import type { BacklogItem, EntryRunLocation } from "@warpforge/protocol";
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
import { Kbd } from "@warpforge/ui/components/kbd";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useState } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { useFactoryChoices } from "../backlog/factory";
import { errorText } from "./pull-meta";

const LOCATIONS: { value: EntryRunLocation; label: string }[] = [
  { value: "default", label: "Project default" },
  { value: "worktree", label: "Background copy" },
  { value: "checkout", label: "Your project folder" },
];

/** The issue becomes a task, and the issue learns the task's id: the link goes both ways. */
export function StartTaskDialog({
  project,
  issue,
  onClose,
  onStarted,
}: {
  project: string;
  issue: BacklogItem | null;
  onClose: () => void;
  onStarted: (itemId: string, taskId: string) => void;
}) {
  const open = issue !== null;
  const { agents, workflows } = useFactoryChoices(project, open);
  const [agent, setAgent] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [location, setLocation] = useState<EntryRunLocation>("default");
  const [deliver, setDeliver] = useState(true);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!issue || busy) return;
    setBusy(true);
    try {
      const result = await daemon.runnerEnqueue(project, [issue.id], {
        workflow: workflow || null,
        agent: agent || null,
        model: null,
        runLocation: location,
        deliver,
      });
      const created = result.created[0];
      if (!created) {
        const reason = result.skipped[0]?.reason;
        toast.error(
          reason?.kind === "already_in_factory"
            ? `#${issue.number} already has a task`
            : reason?.kind === "closed"
              ? `#${issue.number} is closed`
              : `Could not start a task from #${issue.number}`,
        );
        return;
      }
      toast.success(`${created.started ? "Started" : "Queued"} a task from #${issue.number}`, {
        description: created.started ? undefined : "It starts when a slot frees up.",
      });
      onStarted(issue.id, created.taskId);
      onClose();
    } catch (err) {
      toast.error(errorText(err, "Could not start the task"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void start();
        }}
      >
        <DialogHeader>
          <DialogTitle>Start a task from #{issue?.number}</DialogTitle>
          <DialogDescription>
            The issue is the goal. It shows on the board, and #{issue?.number} shows the task.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-40 overflow-y-auto rounded-md bg-muted/40 px-3 py-2 text-xs">
          <p className="font-medium">{issue?.title}</p>
          {issue?.body && (
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">
              {issue.body}
            </p>
          )}
        </div>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <SelectMenu
              label="Agent"
              value={agent}
              onChange={setAgent}
              options={[
                { value: "", label: "Project default" },
                ...agents.map((entry) => ({ value: entry.id, label: entry.displayName })),
              ]}
            />
            <FieldDescription className="text-xs">
              Stages the workflow pins to an agent keep their own.
            </FieldDescription>
          </Field>
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
                  hint: entry.valid
                    ? (entry.stages ?? []).join(" → ")
                    : (entry.error ?? "Can't load"),
                  disabled: !entry.valid,
                })),
              ]}
            />
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
              {LOCATIONS.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value} className="flex-1 text-xs">
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
          <Button disabled={busy} onClick={() => void start()}>
            Start task{" "}
            <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
              ⌘↵
            </Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
