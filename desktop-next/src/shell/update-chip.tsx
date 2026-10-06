import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { ArrowUpCircleIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { updater } from "../lib/updater";

const LABEL: Record<string, string> = {
  ready: "Update ready",
  downloading: "Downloading update",
  installing: "Restarting",
  error: "Update failed",
  available: "Update available",
};

/** Title-bar chip that opens the update, then downloads it and restarts. */
export function UpdateChip() {
  const state = useSyncExternalStore(updater.subscribe, updater.getState);
  const [open, setOpen] = useState(false);
  const visible =
    state.status === "available" ||
    state.status === "downloading" ||
    state.status === "ready" ||
    state.status === "installing" ||
    (state.status === "error" && Boolean(state.nextVersion));
  if (!visible) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        className="text-emerald-700 dark:text-emerald-400"
      >
        <ArrowUpCircleIcon />
        {LABEL[state.status] ?? "Update"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.nextVersion ? `Update to ${state.nextVersion}` : "Update"}</DialogTitle>
            {state.notes && <DialogDescription className="whitespace-pre-wrap">{state.notes}</DialogDescription>}
          </DialogHeader>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.status === "downloading" && (
            <p className="text-sm text-muted-foreground">
              {state.progress == null ? "Downloading…" : `${Math.round(state.progress)}%`}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {state.status === "available" && <Button onClick={() => void updater.download()}>Download</Button>}
            {state.status === "ready" && (
              <Button onClick={() => void updater.installAndRestart()}>Restart to update</Button>
            )}
            {state.status === "error" && <Button onClick={() => void updater.check()}>Try again</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
