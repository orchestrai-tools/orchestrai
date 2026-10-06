import type { TaskInfo } from "@warpforge/protocol";
import { useMemo } from "react";
import { useDaemon } from "../lib/use-daemon";
import { needsPerson, visibleTasks } from "../model/tasks";

export interface ProjectMark {
  waiting: number;
  running: number;
}

export function projectMark(name: string, tasks: TaskInfo[]): ProjectMark {
  const mine = visibleTasks(tasks, name);
  return {
    waiting: mine.filter(needsPerson).length,
    running: mine.filter((task) => task.status === "running").length,
  };
}

/** What needs you and what is running, per project and across all of them. */
export function useProjectMarks() {
  const state = useDaemon();
  const { tasks, projects } = state.snapshot;
  return useMemo(() => {
    const marks = new Map(projects.map((project) => [project.name, projectMark(project.name, tasks)]));
    const waiting = visibleTasks(tasks).filter(needsPerson).length;
    return { projects, marks, waiting };
  }, [projects, tasks]);
}
