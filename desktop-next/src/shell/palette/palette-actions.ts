import { isSettledTask, settleableTasks } from "@warpforge/core/taskShelf";
import { daemon } from "@warpforge/daemon";
import { useEffect, useMemo, useState } from "react";
import { useIgnoredFiles } from "../../components/ignored-files";
import { shellActions } from "../../lib/actions";
import { useAgentPalette } from "../../lib/agent-palette";
import { domainPaletteActions } from "../../lib/domain-actions";
import { useLspPalette } from "../../lib/lsp-palette";
import { taskIsPinned } from "../../lib/pin-group";
import { useProjectPalette } from "../../lib/project-palette";
import { useSelectedPull } from "../../lib/selected-pull";
import { useShelfPalette } from "../../lib/shelf-palette";
import { fileRepoTarget, useShell } from "../../lib/shell-store";
import {
  queuePaletteActions,
  surfacePaletteActions,
  taskPaletteActions,
  type PaletteAction,
} from "../../lib/task-palette";
import { useDaemon } from "../../lib/use-daemon";
import { useRunCommandPalette } from "../command-bar/palette";
import { isFactoryTask, queuedOrder } from "../../model/factory";
import { NAV_PAGES, pageShortcut } from "../../model/pages";
import { isChat } from "../../model/chat";
import { visibleTasks } from "../../model/tasks";

export type PaletteGroup =
  | "Suggested"
  | "This task"
  | "Go to"
  | "Tasks"
  | "Project"
  | "Run"
  | "Agents"
  | "Projects"
  | "View";

export interface PaletteEntry extends PaletteAction {
  group: PaletteGroup;
  title: string;
  shortcut?: string;
}

const SHORTCUT = /\s+((?:G [A-Z,]|[⌘⌃⌥⇧][^\s]*)(?:\s*\/\s*[⌘⌃⌥⇧][^\s]*)?)$/;
const SUGGESTED = new Set(["new", "add", "home", "open-settings", "find"]);
const VIEW = new Set(["sidebar", "focus", "inspector", "terminal", "font-up", "font-down", "font-reset"]);

/** The palette prints a shortcut beside its action, so the label's trailing keys move there. */
export function splitShortcut(label: string): { title: string; shortcut?: string } {
  const match = SHORTCUT.exec(label);
  if (!match) return { title: label };
  return { title: label.slice(0, match.index), shortcut: match[1] };
}

function entries(group: PaletteGroup, actions: PaletteAction[]): PaletteEntry[] {
  return actions.map((action) => ({ ...action, group, ...splitShortcut(action.label) }));
}

/** Every action the palette offers, grouped with the current project's first and the wider scope below. */
export function usePaletteActions(open: boolean): { actions: PaletteEntry[]; queueError: string | null } {
  const shell = useShell();
  const state = useDaemon();
  const { tasks, projects, services, portforwards, agents } = state.snapshot;
  const openTask = tasks.find((task) => task.id === shell.taskId);
  const projectActions = useProjectPalette(shell.project, open, tasks);
  const agentActions = useAgentPalette(open, agents ?? []);
  const lspActions = useLspPalette(open);
  const runActions = useRunCommandPalette(open);
  const selectedPull = useSelectedPull((store) => store.pull);
  const ignoredOpen = useIgnoredFiles((store) => store.open);
  const shelfActions = useShelfPalette(fileRepoTarget(shell, tasks), open);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !openTask || !isFactoryTask(openTask)) {
      setQueue([]);
      setQueueError(null);
      return;
    }
    void daemon.runnerStatus(openTask.project).then(
      (status) => {
        setQueue(queuedOrder(status.entries));
        setQueueError(null);
      },
      (err: unknown) => setQueueError(err instanceof Error ? err.message : "Could not load the queue"),
    );
  }, [open, openTask]);

  const actions = useMemo(() => {
    if (!open) return [];
    const basics = shellActions(shell);
    const pages: PaletteAction[] = NAV_PAGES.map((page) => ({
      id: `page:${page.id}`,
      label: [page.title, pageShortcut(page)].filter(Boolean).join(" "),
      run: () => {
        if (!shell.project && projects[0]) shell.openProject(projects[0].name);
        shell.setPage(page.id);
      },
    }));
    const projectJumps: PaletteAction[] = projects
      .filter((project) => shell.home || project.name !== shell.project)
      .map((project) => ({
        id: `project:${project.name}`,
        label: shell.home ? `Open ${project.name}` : `Switch to ${project.name}`,
        keywords: project.path,
        run: () => shell.openProject(project.name),
      }));
    const scoped = visibleTasks(tasks, shell.home ? null : shell.project);
    const chats = tasks.filter(
      (task) => isChat(task) && (shell.home || task.project === shell.project),
    );
    const taskJumps: PaletteAction[] = [...scoped, ...chats].map((task) => ({
      id: `task:${task.id}`,
      label: isChat(task) ? `Chat: ${task.title || task.prompt || "New chat"}` : task.title || task.prompt,
      keywords: `${task.project} ${task.status} ${task.id}`,
      run: () => shell.openTask(task.id, task.project),
    }));
    const finished = settleableTasks(scoped, Math.floor(Date.now() / 1000));
    const done = visibleTasks(tasks, shell.project).filter(isSettledTask);
    const taskActions = openTask
      ? [
          ...surfacePaletteActions(),
          ...taskPaletteActions(openTask, taskIsPinned(tasks, shell.pinned, openTask.id)),
          ...queuePaletteActions(openTask, queue),
        ]
      : [];
    const domain = domainPaletteActions({
      shell,
      tasks,
      services,
      forwards: portforwards,
      ignoredOpen,
      shelfActions,
      projectActions,
      selectedPull,
      finished,
      done,
    });
    return [
      ...entries("Suggested", basics.filter((action) => SUGGESTED.has(action.id))),
      ...entries("This task", taskActions),
      ...(shell.home ? [] : entries("Go to", pages)),
      ...entries("Tasks", taskJumps),
      ...entries("Project", [...domain, ...lspActions]),
      ...entries("Run", runActions),
      ...entries("Agents", agentActions),
      ...entries("Projects", projectJumps),
      ...entries("View", basics.filter((action) => VIEW.has(action.id) || !SUGGESTED.has(action.id))),
    ];
  }, [
    open,
    shell,
    projects,
    tasks,
    services,
    portforwards,
    openTask,
    queue,
    projectActions,
    agentActions,
    lspActions,
    runActions,
    selectedPull,
    ignoredOpen,
    shelfActions,
  ]);

  return { actions, queueError };
}

export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  "Suggested",
  "This task",
  "Go to",
  "Tasks",
  "Project",
  "Run",
  "Agents",
  "Projects",
  "View",
];
