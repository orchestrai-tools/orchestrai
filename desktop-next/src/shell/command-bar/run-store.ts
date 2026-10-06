import { daemon } from "@warpforge/daemon";
import type { RunCommand, RunCommands } from "@warpforge/protocol";
import { create } from "zustand";
import { readHistory, writeHistory } from "../../lib/shell-commands";
import { fileTaskId, useShell } from "../../lib/shell-store";
import { needsInput, runPlace, type BarItem, type RunPlace } from "./model";

export interface RunResult {
  command: string;
  text: string;
  code?: number | null;
  cwd?: string;
  /** `shell.run` gave up at its time limit; the same line can still open in a terminal. */
  timedOut?: boolean;
}

/** A command waiting on its parameters or a confirm before it runs. */
export interface PendingRun {
  command: RunCommand;
  flipped: boolean;
}

interface RunState {
  /** Which checkout `detected` describes, so a switch shows nothing stale. */
  scope: string;
  detected: RunCommands | null;
  loadError: string | null;
  loading: boolean;
  history: string[];
  busy: boolean;
  result: RunResult | null;
  pending: PendingRun | null;
  load: () => void;
  choose: (item: BarItem, flipped: boolean) => void;
  execute: (line: string, place: RunPlace) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

function where(): { project: string; taskId: string; scope: string } {
  const shell = useShell.getState();
  const project = shell.project ?? "";
  const taskId = fileTaskId(shell, daemon.getState().snapshot.tasks);
  return { project, taskId, scope: `${project}\u0000${taskId}` };
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The command bar's state, shared with the palette so both run commands the same way. */
export const useCommandRun = create<RunState>()((set, get) => ({
  scope: "",
  detected: null,
  loadError: null,
  loading: false,
  history: [],
  busy: false,
  result: null,
  pending: null,

  load: () => {
    const { project, taskId, scope } = where();
    if (!project) return;
    if (scope !== get().scope)
      set({ scope, detected: null, loadError: null, history: readHistory(project) });
    set({ loading: true });
    void daemon
      .request("shell.commands", { project, task_id: taskId || null })
      .then((found) => {
        if (where().scope === scope) set({ detected: found as RunCommands, loadError: null });
      })
      .catch((err: unknown) => {
        if (where().scope === scope) set({ loadError: message(err, "Could not read the project's commands") });
      })
      .finally(() => set({ loading: false }));
  },

  choose: (item, flipped) => {
    const command = item.command;
    if (command && (needsInput(command) || command.confirm != null)) {
      set({ pending: { command, flipped } });
      return;
    }
    void get().execute(item.line, runPlace(command, flipped));
  },

  execute: async (raw, place) => {
    const line = raw.trim();
    const { project, taskId } = where();
    if (!project || !line || get().busy) return;
    set({ pending: null, history: writeHistory(project, [line, ...get().history.filter((h) => h !== line)]) });
    if (place === "terminal") {
      try {
        const id = await daemon.runInTerminal(project, line, taskId || undefined);
        if (id) useShell.getState().openTerminal(id);
      } catch (err) {
        set({ result: { command: line, text: message(err, "Could not open a terminal") } });
      }
      return;
    }
    set({ busy: true });
    try {
      const out = (await daemon.request("shell.run", {
        project,
        command: line,
        task_id: taskId || null,
      })) as { code?: number | null; cwd?: string; stdout?: string; stderr?: string };
      set({
        result: {
          command: line,
          code: out.code,
          cwd: out.cwd,
          text: [out.stdout, out.stderr].filter(Boolean).join("\n") || `exit ${out.code ?? "?"}`,
        },
      });
    } catch (err) {
      const text = message(err, "Could not run the command");
      set({ result: { command: line, text, timedOut: /longer than 30 seconds/.test(text) } });
    } finally {
      set({ busy: false });
    }
  },

  cancel: () => set({ pending: null }),
  dismiss: () => set({ result: null }),
}));
