import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { useShell } from "../../lib/shell-store";

/** The Factory could not give the project folder back: retry once it is clean, or open a terminal to clean it. */
export function CheckoutHeldActions({
  task,
  compact = false,
}: {
  task: TaskInfo;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (task.status !== "blocked" || task.blockedKind !== "checkout_held") return null;

  async function retry() {
    setBusy(true);
    try {
      await daemon.runnerRetryCheckout(task.project);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch the checkout back");
    } finally {
      setBusy(false);
    }
  }

  function openTerminal() {
    const shell = useShell.getState();
    if (shell.project !== task.project || shell.home) shell.openProject(task.project);
    useShell.setState({ terminal: true });
  }

  const size = compact ? "xs" : "sm";
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size={size}
        disabled={busy}
        title="Switch your project folder back once it is clean"
        onClick={() => void retry()}
      >
        {busy ? "Trying…" : "Try again"}
      </Button>
      <Button size={size} variant="outline" onClick={openTerminal}>
        Open terminal
      </Button>
    </div>
  );
}
