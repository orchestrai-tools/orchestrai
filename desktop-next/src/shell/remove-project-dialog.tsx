import { forgetProject, forgetTask } from "@warpforge/core/sessionStore";
import { daemon } from "@warpforge/daemon";
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
import { toast } from "sonner";
import { create } from "zustand";
import { clearBrowserSession } from "../lib/browser-session";
import { dropHiddenSessions } from "../lib/hidden-sessions";
import { liveResourceSummary, projectLiveCounts } from "../lib/project-live";
import { dropProjectCommands } from "../lib/shell-commands";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";

const useRemoving = create<{ project: string | null }>(() => ({ project: null }));

/** Asks to remove a project from anywhere: a tab menu, the palette, or settings. */
export function requestRemoveProject(project: string) {
  useRemoving.setState({ project });
}

/** Confirm removing a project, naming the live resources that will stop. */
export function RemoveProjectDialog() {
  const project = useRemoving((state) => state.project);
  const snapshot = useDaemon().snapshot;
  const [busy, setBusy] = useState(false);
  const close = () => useRemoving.setState({ project: null });
  const live = project ? liveResourceSummary(projectLiveCounts(snapshot, project)) : "";

  useEffect(() => {
    const ask = (event: Event) => {
      const name = (event as CustomEvent<unknown>).detail;
      if (typeof name === "string" && name) requestRemoveProject(name);
    };
    window.addEventListener("orc-remove-project", ask);
    return () => window.removeEventListener("orc-remove-project", ask);
  }, []);

  async function remove(name: string) {
    setBusy(true);
    try {
      await daemon.removeProject(name, true);
      forgetProject(name);
      for (const task of daemon.getState().snapshot.tasks) {
        if (task.project !== name) continue;
        forgetTask(task.id);
        clearBrowserSession(task.id);
      }
      dropProjectCommands(name);
      dropHiddenSessions(name);
      useShell.getState().releaseProject(name);
      toast.success(`Removed ${name}`);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={project != null} onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Remove {project}?</DialogTitle>
          <DialogDescription>
            This removes the project from OrchestrAI. The folder and files stay. Live resources for
            this project stop.
          </DialogDescription>
        </DialogHeader>
        {live && <p className="text-sm">Will stop: {live}.</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !project}
            onClick={() => project && void remove(project)}
          >
            {live ? "Stop resources and remove" : "Remove project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
