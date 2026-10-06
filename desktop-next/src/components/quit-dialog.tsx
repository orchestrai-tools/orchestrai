import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import type { PendingQuit } from "../lib/use-quit";

/** Asks before quit when something is still running, then shows that it is stopping. */
export function QuitDialog({ quit }: { quit: PendingQuit }) {
  const [stopping, setStopping] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && !stopping && quit.cancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stop everything and quit?</DialogTitle>
          <DialogDescription>Quitting stops these first.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-xs">
          {quit.blockers.map((blocker) => (
            <li key={blocker} className="truncate py-0.5" title={blocker}>
              {blocker}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={stopping} onClick={quit.cancel}>
            Wait
          </Button>
          <Button
            variant="destructive"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              void quit.confirm().finally(() => setStopping(false));
            }}
          >
            {stopping && <LoaderCircleIcon className="animate-spin" />}
            {stopping ? "Stopping…" : "Stop everything and quit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
