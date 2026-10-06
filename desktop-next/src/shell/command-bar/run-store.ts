import { daemon } from "@warpforge/daemon";
import type { RunCommand, RunCommands } from "@warpforge/protocol";
import { create } from "zustand";

import { readHistory, writeHistory } from "../../lib/shell-commands";
import { fileTaskId, useShell } from "../../lib/shell-store";
import { needsInput, runPlace, type BarItem, type RunPlace } from "./model";

export interface RunContext {
  project: string;
  taskId: string;
  scope: string;
}

export interface RunResult {
  context: RunContext;
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
  context: RunContext;
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
  results: Record<string, RunResult>;
  running: string[];
  pending: PendingRun | null;
  load: () => void;
  choose: (item: BarItem, flipped: boolean) => void;
  execute: (line: string, place: RunPlace, context?: RunContext) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}

function where(): RunContext {
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
  results: {},
  running: [],
  pending: null,

  load: () => {
    const { project, taskId, scope } = where();
    if (!project) return;
    if (scope !== get().scope)
      set({
        scope,
        detected: null,
        loadError: null,
        history: readHistory(project),
        result: get().results[scope] ?? null,
        busy: get().running.includes(scope),
        pending: null,
      });
    set({ loading: true });
    void daemon
      .request("shell.commands", { project, task_id: taskId || null })
      .then((found) => {
        if (where().scope === scope) set({ detected: found as RunCommands, loadError: null });
      })
      .catch((err: unknown) => {
        if (where().scope === scope)
          set({ loadError: message(err, "Could not read the project's commands") });
      })
      .finally(() => {
        if (where().scope === scope) set({ loading: false });
      });
  },

  choose: (item, flipped) => {
    const command = item.command;
    if (command && (needsInput(command) || command.confirm != null)) {
      set({ pending: { command, flipped, context: where() } });
      return;
    }
    void get().execute(item.line, runPlace(command, flipped));
  },

  execute: async (raw, place, context = where()) => {
    const line = raw.trim();
    const { project, taskId, scope } = context;
    if (!project || !line || get().running.includes(scope)) return;
    const history = writeHistory(project, [
      line,
      ...readHistory(project).filter((h) => h !== line),
    ]);
    set({ pending: null, ...(where().scope === scope ? { history } : {}) });
    const finish = (result: Omit<RunResult, "context">) => {
      const scoped = { ...result, context };
      set({
        results: { ...get().results, [scope]: scoped },
        ...(where().scope === scope ? { result: scoped } : {}),
      });
    };
    if (place === "terminal") {
      try {
        const id = await daemon.runInTerminal(project, line, taskId || undefined);
        if (id && where().scope === scope) useShell.getState().openTerminal(id);
      } catch (err) {
        finish({ command: line, text: message(err, "Could not open a terminal") });
      }
      return;
    }
    set({ running: [...get().running, scope], ...(where().scope === scope ? { busy: true } : {}) });
    try {
      const out = (await daemon.request("shell.run", {
        project,
        command: line,
        task_id: taskId || null,
      })) as { code?: number | null; cwd?: string; stdout?: string; stderr?: string };
      finish({
        command: line,
        code: out.code,
        cwd: out.cwd,
        text: [out.stdout, out.stderr].filter(Boolean).join("\n") || `exit ${out.code ?? "?"}`,
      });
    } catch (err) {
      const text = message(err, "Could not run the command");
      finish({ command: line, text, timedOut: /longer than 30 seconds/.test(text) });
    } finally {
      set({
        running: get().running.filter((item) => item !== scope),
        ...(where().scope === scope ? { busy: false } : {}),
      });
    }
  },

  cancel: () => set({ pending: null }),
  dismiss: () => {
    const results = { ...get().results };
    delete results[where().scope];
    set({ result: null, results });
  },
}));
