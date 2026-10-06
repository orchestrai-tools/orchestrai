import { daemon } from "@warpforge/daemon";
import type {
  PortForwardInfo,
  PullRequestSummary,
  ServiceInfo,
  TaskInfo,
} from "@warpforge/protocol";
import { toast } from "sonner";
import { branchPaletteActions, openPrPaletteAction } from "./branch-ask";
import { useCreateAsk } from "./create-ask";
import { dreamPaletteActions } from "./dream";
import {
  editorCommands,
  FILE_CHANGE_ACTIONS,
  fileCreateActions,
  runLabeledButton,
} from "./editor-commands";
import { syncTask } from "./git-actions";
import { githubPaletteActions, pullCopyActions } from "./github-refresh";
import { markProjectPullsRead } from "./inbox-seen";
import type { RepoTarget } from "./repo-target";
import { servicePaletteActions } from "./service-actions";
import { currentPage, fileRepoTarget, fileTaskId, useShell, type ShellState } from "./shell-store";
import type { PaletteAction } from "./task-palette";
import { trackerPaletteActions } from "./tracker-palette";
import { useMergeWorktree } from "../components/merge-worktree-dialog";
import { ignoredPaletteAction } from "../components/ignored-files";

function openCheckout(): RepoTarget | null {
  return fileRepoTarget(useShell.getState(), daemon.getState().snapshot.tasks);
}

export function syncBranch(): void {
  const target = openCheckout();
  if (!target) toast.info("Open a project before syncing its branch");
  else void syncTask(target);
}

export function openPush(): void {
  if (!openCheckout()) toast.info("Open a project before pushing its branch");
  else useShell.getState().toggle("push");
}

export function openNewBranch(): void {
  if (!openCheckout()) toast.info("Open a project before creating a branch");
  else useShell.getState().toggle("newBranch");
}

/** Project, git, and file actions. The palette, menu, and shortcuts share these. */
export function domainPaletteActions(input: {
  shell: ShellState;
  tasks: TaskInfo[];
  services: ServiceInfo[];
  forwards: PortForwardInfo[];
  ignoredOpen: boolean;
  shelfActions: PaletteAction[];
  projectActions: PaletteAction[];
  selectedPull: PullRequestSummary | null;
  finished: TaskInfo[];
  done: TaskInfo[];
}): PaletteAction[] {
  const { shell, tasks } = input;
  const gitTask = fileTaskId(shell, tasks);
  const fileActions: PaletteAction[] =
    currentPage(shell) === "files"
      ? [
          ...fileCreateActions(),
          {
            id: "save",
            label: "Save ⌘S",
            run: () => {
              const editor = editorCommands();
              if (!editor) toast.error("Open a file first");
              else editor.save();
            },
          },
          {
            id: "define",
            label: "Go to definition ⌘B",
            run: () => {
              const editor = editorCommands();
              if (!editor?.define()) toast.error("Put the cursor on a symbol in the editor first");
            },
          },
          ...FILE_CHANGE_ACTIONS.map((label) => ({
            id: label.toLowerCase().replaceAll(" ", "-"),
            label,
            run: () => {
              if (!runLabeledButton(label)) toast.error("Open a file with changes first");
            },
          })),
        ]
      : [];
  const gitActions: PaletteAction[] = gitTask
    ? [
        {
          id: "commit",
          label: "Commit… ⌘↵",
          run: () => {
            shell.setPage("changes");
            window.setTimeout(() => document.getElementById("commit-message")?.focus(), 0);
          },
        },
        { id: "sync", label: "Sync with remote ⌘T", run: syncBranch },
        { id: "push", label: "Push… ⇧⌘K", run: openPush },
        { id: "branch", label: "New branch… ⌥⌘N", run: openNewBranch },
        ...branchPaletteActions(),
        openPrPaletteAction(gitTask, tasks.find((task) => task.id === gitTask)?.title || "Changes"),
        ignoredPaletteAction(input.ignoredOpen),
        ...input.shelfActions,
        {
          id: "merge-worktree",
          label: "Merge worktree",
          run: () => useMergeWorktree.getState().ask(gitTask),
        },
      ]
    : [];
  const project = shell.project;
  const projectRows: PaletteAction[] = project
    ? [
        {
          id: "stop-factory",
          label: "Stop all Factory tasks",
          run: () => shell.toggle("stopFactory"),
        },
        ...input.projectActions,
        ...trackerPaletteActions(project),
        ...githubPaletteActions(),
        ...pullCopyActions(input.selectedPull),
        ...dreamPaletteActions(project),
        {
          id: "mark-read",
          label: "Mark pull requests as read",
          run: () => markProjectPullsRead(project),
        },
        ...servicePaletteActions(project, input.services, input.forwards),
        {
          id: "setup-project",
          label: "Set up project…",
          run: () =>
            window.dispatchEvent(new CustomEvent("orc-setup-project", { detail: project })),
        },
        {
          id: "new-item",
          label: "New work item…",
          run: () => {
            shell.setPage("backlog");
            useCreateAsk.getState().ask("work");
          },
        },
        {
          id: "new-automation",
          label: "New automation…",
          run: () => {
            shell.setPage("automations");
            useCreateAsk.getState().ask("automation");
          },
        },
        {
          id: "remove-project",
          label: "Remove project…",
          run: () =>
            window.dispatchEvent(new CustomEvent("orc-remove-project", { detail: project })),
        },
      ]
    : [];
  const doneRows: PaletteAction[] =
    project && input.done.length > 0
      ? [
          {
            id: "delete-done",
            label: `Delete ${input.done.length} done…`,
            run: () => shell.toggle("deleteDone"),
          },
        ]
      : [];
  const settleRows: PaletteAction[] =
    input.finished.length > 0
      ? [
          {
            id: "settle",
            label: `Settle ${input.finished.length} finished`,
            run: () => {
              void Promise.all(
                input.finished.map((task) => daemon.request("task.settle", { task_id: task.id })),
              ).then(() => toast.success(`Settled ${input.finished.length} finished`));
            },
          },
        ]
      : [];
  return [...fileActions, ...gitActions, ...projectRows, ...doneRows, ...settleRows];
}
