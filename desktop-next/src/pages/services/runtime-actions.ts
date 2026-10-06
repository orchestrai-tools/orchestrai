import { daemon } from "@warpforge/daemon";
import type { LogEntry } from "@warpforge/daemon/types";
import { toast } from "sonner";
import { create } from "zustand";
import { attachContext } from "../../lib/composer-chips";
import { logContextChip, type LogSourceKind } from "../../lib/log-context";
import { useShell } from "../../lib/shell-store";
import { useTaskDraft } from "../../lib/new-task";

export type RuntimeKind = "service" | "forward";

export interface RuntimeKey {
  kind: RuntimeKind;
  name: string;
}

/** The item open on the Services page, per project, kept while you visit other pages. */
export const useRuntimeSelection = create<{
  selected: Record<string, string>;
  select: (project: string, key: RuntimeKey) => void;
}>((set) => ({
  selected: {},
  select: (project, key) =>
    set((state) => ({ selected: { ...state.selected, [project]: `${key.kind}:${key.name}` } })),
}));

/** Sends one service or port-forward request and reports a refusal. */
export function runtimeAction(method: string, params: Record<string, unknown>) {
  void daemon
    .request(method, params)
    .catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not update the service"),
    );
}

export function fetchLogs(project: string, key: RuntimeKey) {
  const load =
    key.kind === "service"
      ? daemon.fetchServiceLogs(project, key.name)
      : daemon.fetchPortForwardLogs(project, key.name);
  void load.catch((err: unknown) =>
    toast.error(err instanceof Error ? err.message : "Could not load logs"),
  );
}

function chipFor(kind: RuntimeKind, name: string, entries: LogEntry[]) {
  const source: LogSourceKind = kind === "forward" ? "portforward" : "service";
  return logContextChip(source, name, entries);
}

/** Attaches log lines, with their seq range, to a task's conversation; without one it goes to the open task or a new draft. */
export function attachLogs(
  project: string,
  kind: RuntimeKind,
  name: string,
  entries: LogEntry[],
  taskId?: string,
) {
  if (entries.length === 0) {
    toast.error("No log lines to add");
    return;
  }
  if (taskId) useShell.getState().openTask(taskId, project);
  const chip = chipFor(kind, name, entries);
  attachContext(project, chip.label, chip.body);
}

/** Opens the new task dialog with the log lines as its starting prompt. */
export function newTaskWithLogs(kind: RuntimeKind, name: string, entries: LogEntry[]) {
  if (entries.length === 0) {
    toast.error("No log lines to add");
    return;
  }
  const chip = chipFor(kind, name, entries);
  useTaskDraft.getState().open(`${chip.label}\n\n${chip.body}`);
}

export function copyText(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy"),
  );
}
