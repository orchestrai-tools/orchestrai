import type { AutomationRun } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { RUN_STATUS_META, runDuration } from "../../lib/automation-run";
import { RunDot } from "./run-dot";
import { formatWhen } from "./schedule";

/** What one automation run did. The full transcript stays on the task. */
export function RunOutputDialog({
  automationName,
  run,
  onOpenTask,
  onClose,
}: {
  automationName: string;
  run: AutomationRun | null;
  onOpenTask: (id: string) => void;
  onClose: () => void;
}) {
  const meta = run ? RUN_STATUS_META[run.status] : null;
  return (
    <Dialog open={run !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {run && meta && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RunDot status={run.status} />
                {automationName} · run #{run.runNumber}
              </DialogTitle>
              <DialogDescription>
                {run.trigger === "manual" ? "Started by hand" : "Scheduled run"} · {formatWhen(run.startedAt * 1000)} ·{" "}
                {runDuration(run)} · {meta.label}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{meta.hint}</p>
            {run.error && <p className="text-sm text-red-600 dark:text-red-400">{run.error}</p>}
            {run.output ? (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{run.output}</pre>
            ) : (
              <p className="text-xs text-muted-foreground">No output recorded for this run.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {run.taskId && (
                <Button
                  onClick={() => {
                    const taskId = run.taskId ?? "";
                    onClose();
                    onOpenTask(taskId);
                  }}
                >
                  Open task
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
