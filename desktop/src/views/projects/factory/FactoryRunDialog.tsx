import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { WorkItem } from "@/components/backlog/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { daemon } from "@/daemon";
import { runnerStatusKey, useQueueInFactory } from "@/hooks/useRunner";
import type { EntryRunLocation } from "@/protocol";

import { LOCATION_LABEL, projectDefaultLabel, resolveLocation } from "./location";

interface FactoryRunDialogProps {
  project: string;
  /** The items to queue; `null` keeps the dialog closed. */
  items: WorkItem[] | null;
  onClose: () => void;
  /** Runs once the items are queued; not on cancel or a failed queue. */
  onQueued?: () => void;
}

/**
 * Asks where queued items run before they go to the Factory: the project's
 * default, a worktree, or the project checkout. One choice covers every item.
 *
 * @param props.project The project the items belong to.
 * @param props.items The items to queue, or `null` while closed.
 * @param props.onClose Closes the dialog.
 * @param props.onQueued Called after the items were queued.
 */
export function FactoryRunDialog({ project, items, onClose, onQueued }: FactoryRunDialogProps) {
  const queueInFactory = useQueueInFactory(project);
  const open = items !== null;
  const [choice, setChoice] = useState<EntryRunLocation>("default");
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) setChoice("default");
  }
  const status = useQuery({
    enabled: open,
    queryFn: () => daemon.runnerStatus(project),
    queryKey: runnerStatusKey(project),
  });
  const workflows = useQuery({
    enabled: open,
    queryFn: () => daemon.workflowList(project),
    queryKey: ["workflows", project],
  });
  const settings = status.data?.settings;
  const projectLocation = settings?.runLocation ?? "worktree";
  const workflow = workflows.data?.find((meta) => meta.id === settings?.workflow);
  const resolved = resolveLocation(projectLocation, choice, workflow);
  const verifyBlocked = resolved === "worktree" && workflow?.verifyRequired === true;
  const count = items?.length ?? 0;
  const options: { value: EntryRunLocation; label: string }[] = [
    { label: projectDefaultLabel(projectLocation, workflow), value: "default" },
    { label: LOCATION_LABEL.worktree, value: "worktree" },
    { label: LOCATION_LABEL.checkout, value: "checkout" },
  ];

  const queue = () => {
    if (!items) return;
    const itemIds = items.map((item) => item.id);
    onClose();
    void queueInFactory(itemIds, choice).then((queued) => {
      if (queued) onQueued?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {count === 1
              ? `Run ${items![0]!.number || "this item"} in Factory`
              : `Run ${count} items in Factory`}
          </DialogTitle>
          <DialogDescription>
            Worktree items can run side by side. The project checkout runs one item at a time, so
            the running app serves the change and a verify stage can test it.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[11px] font-medium text-muted-foreground">
            Run location
          </legend>
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="factory-run-location"
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
              />
              {option.label}
            </label>
          ))}
          {verifyBlocked && (
            <p className="text-[11px] text-warn">
              This workflow verifies in the browser, which needs Project checkout. In a worktree the
              run stops at its verify stage and waits for you.
            </p>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={queue}>Queue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
