import { daemon } from "@warpforge/daemon";
import type { WorktreeRow } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { useEffect, useState } from "react";

import { copyText } from "./file-ops";

/** What the worktree's setup script printed when the checkout was made. */
export function SetupLogDialog({ row, onClose }: { row: WorktreeRow | null; onClose: () => void }) {
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taskId = row?.taskId;

  useEffect(() => {
    setLog(null);
    setError(null);
    if (!taskId) return;
    let cancel = false;
    void daemon
      .worktreeSetupLog(taskId)
      .then((next) => !cancel && setLog(next))
      .catch(
        (err: unknown) =>
          !cancel && setError(err instanceof Error ? err.message : "Could not read the setup log"),
      );
    return () => {
      cancel = true;
    };
  }, [taskId]);

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Setup log</DialogTitle>
          <DialogDescription className="font-mono">{row?.branch ?? row?.path}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!error && log === null && (
          <p className="text-sm text-muted-foreground">Reading the log…</p>
        )}
        {log !== null && (
          <pre className="max-h-96 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
            {log || "The setup log is empty."}
          </pre>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!log}
            onClick={() => log && copyText(log, "setup log")}
          >
            Copy
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
