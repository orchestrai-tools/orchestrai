import { daemon } from "@warpforge/daemon";
import type { ExternalSession, TaskInfo } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { hiddenSessionIds, hideSession, unhideSession, useHiddenSessions } from "./hidden-sessions";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Resume a session already on disk, or fork a task from this project. */
export function useSessionPalette(
  project: string | null,
  open: boolean,
  tasks: TaskInfo[],
): PaletteAction[] {
  const [sessions, setSessions] = useState<ExternalSession[]>([]);
  useHiddenSessions((state) => state.tick);
  useEffect(() => {
    if (!open || !project) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    void daemon
      .listSessions(project)
      .then((rows) => {
        if (!cancelled) setSessions(rows);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project]);
  if (!project) return [];
  const projectName = project;
  const hidden = hiddenSessionIds(projectName);
  const here = tasks.filter((task) => task.project === project);
  function hideAction(id: string, title: string): PaletteAction {
    const concealed = hidden.includes(id);
    return {
      id: `hide:${id}`,
      label: concealed ? `Unhide ${title}` : `Hide ${title}`,
      run: () => {
        if (concealed) unhideSession(projectName, id);
        else hideSession(projectName, id);
        useShell.getState().setPage("sessions");
        toast.success(concealed ? "Shown again" : "Hidden");
      },
    };
  }
  function copyAction(id: string, title: string): PaletteAction {
    return {
      id: `copy:${id}`,
      label: `Copy id ${title}`,
      run: () => {
        void navigator.clipboard.writeText(id).then(
          () => toast.success("Copied the session id"),
          () => toast.info(id),
        );
      },
    };
  }
  return [
    ...sessions.map((session) => ({
      id: `resume:${session.sessionId}`,
      label: `Resume ${session.title || session.sessionId}`,
      run: () => {
        void daemon
          .resumeTask(project, session.agent, session.sessionId, session.title)
          .then((taskId) => {
            if (taskId) useShell.getState().openTask(taskId, project);
            else toast.error("Could not resume");
          })
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not resume"),
          );
      },
    })),
    ...sessions.map((session) => hideAction(session.sessionId, session.title || session.sessionId)),
    ...sessions.map((session) => copyAction(session.sessionId, session.title || session.sessionId)),
    ...here.map((task) => ({
      id: `fork:${task.id}`,
      label: `Fork ${task.title || task.prompt}`,
      run: () => {
        void daemon
          .request("session.fork", { task_id: task.id })
          .then((result) => {
            const taskId = (result as { taskId?: string }).taskId;
            if (taskId) useShell.getState().openTask(taskId, project);
            else toast.error("Could not fork");
          })
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not fork"),
          );
      },
    })),
    ...here.map((task) => hideAction(task.id, task.title || task.prompt)),
    ...here.map((task) => copyAction(task.id, task.title || task.prompt)),
  ];
}
