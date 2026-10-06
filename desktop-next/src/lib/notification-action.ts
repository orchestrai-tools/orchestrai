import { daemon, DaemonRpcError } from "@warpforge/daemon";
import type { SessionUpdate } from "@warpforge/protocol";
import { useEffect } from "react";
import { toast } from "sonner";
import { bannerPermissionOutcome } from "./attention-notice";
import { useShell } from "./shell-store";

interface NotificationAction {
  action: string;
  kind: string;
  request_id?: string | null;
  task_id: string;
}

/** Answer Approve or Reject from a native notification, or open the task for Review. */
export function useNotificationActions(): void {
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      if (disposed) return;
      unlisten = await listen<NotificationAction>("notification-action", (event) => {
        void handleNotificationAction(event.payload);
      });
      if (disposed) unlisten();
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

async function handleNotificationAction(payload: NotificationAction): Promise<void> {
  const task = daemon.getState().snapshot.tasks.find((item) => item.id === payload.task_id);
  const open = () => {
    if (task) useShell.getState().openTask(task.id, task.project);
    void focusWindow();
  };
  if (payload.kind === "permission" && payload.request_id && (payload.action === "approve" || payload.action === "reject")) {
    const requestId = payload.request_id;
    const updates = daemon.getState().sessionUpdates[payload.task_id] ?? [];
    const found = permissionOptions(updates, requestId);
    const outcome = bannerPermissionOutcome(payload.action, found?.options, found?.browserOrigin);
    if (!outcome) {
      open();
      return;
    }
    try {
      await daemon.request("session.permission", { task_id: payload.task_id, request_id: requestId, outcome });
      await withdraw(payload.task_id, requestId);
    } catch (err) {
      if (err instanceof DaemonRpcError && err.code === "permission_already_resolved") {
        await withdraw(payload.task_id, requestId);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not answer the permission request");
    }
    return;
  }
  if (payload.action === "review" || payload.action === "default") open();
}

function permissionOptions(
  updates: SessionUpdate[],
  requestId: string,
): { options: string[]; browserOrigin?: string } | undefined {
  const request = updates.find((update) => update.kind === "permission_request" && update.request_id === requestId);
  if (request && request.kind === "permission_request") {
    return { options: request.options, browserOrigin: request.browser_origin };
  }
  const tool = [...updates].reverse().find((update) => update.kind === "tool_call" && update.pendingPermission?.request_id === requestId);
  if (tool && tool.kind === "tool_call" && tool.pendingPermission) return { options: tool.pendingPermission.options };
  return undefined;
}

async function withdraw(taskId: string, requestId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("withdraw_attention", { payload: { kind: "permission", task_id: taskId, request_id: requestId } }).catch(() => undefined);
}

async function focusWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    await appWindow.unminimize();
    await appWindow.setFocus();
  } catch {
    // The window is already in front, or this is not the desktop shell.
  }
}
