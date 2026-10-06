import { daemon } from "@warpforge/daemon";
import type { BacklogItem, ProjectSources } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { Textarea } from "@warpforge/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { SelectMenu } from "../../components/common/select-menu";
import { createWorkItem } from "./create-item";
import {
  availableSources,
  PRIORITIES,
  priorityLabel,
  sourceLabel,
  STATUSES,
  statusLabel,
  type Source,
} from "./labels";

const DESTINATION_NOTE: Record<Source, string> = {
  local: "A local work item, kept in this project.",
  github: "Opens an issue in this project's GitHub repository and tracks it here.",
  linear: "Opens an issue in this project's Linear team and tracks it here.",
};

/** A new work item, local or opened in a tracker. Closing over a typed draft asks before the text is thrown away. */
export function NewItemDialog({
  project,
  sources,
  open,
  onClose,
  onCreated,
}: {
  project: string;
  sources: ProjectSources | undefined;
  open: boolean;
  onClose: () => void;
  onCreated: (item: BacklogItem) => void;
}) {
  const [source, setSource] = useState<Source>("local");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("none");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const destinations: Source[] = sources ? availableSources(sources) : ["local"];
  const destination = destinations.includes(source) ? source : "local";
  const local = destination === "local";
  const dirty = title.trim() !== "" || body.trim() !== "" || assignee.trim() !== "";

  function reset() {
    setSource("local");
    setTitle("");
    setBody("");
    setStatus("todo");
    setPriority("none");
    setAssignee("");
    setError(null);
  }

  function finish() {
    reset();
    onClose();
  }

  function requestClose() {
    if (dirty) setDiscard(true);
    else finish();
  }

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { item, externalId } = await createWorkItem(daemon, {
        project,
        source: destination,
        title: title.trim(),
        body,
        status,
        priority,
        assignee,
      });
      toast.success(
        externalId
          ? `Opened ${externalId} in ${sourceLabel(destination)}`
          : `Added #${item.number}`,
      );
      onCreated(item);
      finish();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setError(
        local
          ? reason || "Could not add the item"
          : `Could not open the ${sourceLabel(destination)} issue: ${reason}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function enhance() {
    setBusy(true);
    try {
      const text = await daemon.enhancePrompt(project, "claude", `${title}\n\n${body}`);
      const [nextTitle, ...rest] = text.split("\n");
      if (nextTitle?.trim()) setTitle(nextTitle.trim());
      const nextBody = rest.join("\n").trim();
      if (nextBody) setBody(nextBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enhance the item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void create();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>New item</DialogTitle>
              <DialogDescription>
                {destinations.length > 1
                  ? DESTINATION_NOTE[destination]
                  : "A local work item. Sync brings in issues from a connected GitHub repository or Linear team."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="gap-3">
              {destinations.length > 1 && (
                <Field>
                  <FieldLabel>Create in</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={destination}
                    onValueChange={(next) => next && setSource(next as Source)}
                    aria-label="Where the item is created"
                    className="w-full"
                  >
                    {destinations.map((value) => (
                      <ToggleGroupItem key={value} value={value} className="flex-1">
                        {sourceLabel(value)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="new-item-title">Title</FieldLabel>
                <Input
                  id="new-item-title"
                  autoFocus
                  value={title}
                  placeholder="What needs doing"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-item-body">Description</FieldLabel>
                <Textarea
                  id="new-item-body"
                  value={body}
                  rows={6}
                  placeholder="Markdown. What done looks like helps the agent most."
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-32 font-mono text-xs"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                {local && (
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <SelectMenu
                      label="Status"
                      value={status}
                      onChange={setStatus}
                      options={STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel>Priority</FieldLabel>
                  <SelectMenu
                    label="Priority"
                    value={priority}
                    onChange={setPriority}
                    options={PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))}
                  />
                </Field>
                {local && (
                  <Field>
                    <FieldLabel htmlFor="new-item-assignee">Assignee</FieldLabel>
                    <Input
                      id="new-item-assignee"
                      value={assignee}
                      placeholder="Nobody"
                      onChange={(event) => setAssignee(event.target.value)}
                    />
                  </Field>
                )}
              </div>
              {!local && (
                <p className="text-xs text-muted-foreground">
                  {sourceLabel(destination)} owns the issue's status and assignee; set them there.
                </p>
              )}
            </FieldGroup>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                disabled={busy || !(title.trim() || body.trim())}
                onClick={() => void enhance()}
              >
                <WandSparklesIcon />
                Enhance
              </Button>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || busy}>
                {busy && !local
                  ? `Opening in ${sourceLabel(destination)}…`
                  : local
                    ? "Add item ⌘↵"
                    : `Open in ${sourceLabel(destination)} ⌘↵`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Discard this item?"
        description="The work item has not been created yet, so closing loses what you typed."
        confirmLabel="Discard"
        tone="destructive"
        onConfirm={finish}
      />
    </>
  );
}
