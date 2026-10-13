import { useEffect, useRef } from "react";
import { Toaster } from "sonner";

import { BranchDialog } from "./components/branch-dialog";
import { MergeWorktreeDialog } from "./components/merge-worktree-dialog";
import { NewTaskDialog } from "./components/new-task";
import { PageContent } from "./components/page-content";
import { PushDialog } from "./components/push-dialog";
import { QuitDialog } from "./components/quit-dialog";
import { AddProjectDialog, SetupDialog } from "./components/setup";
import { applyAppIcon } from "./lib/app-icon";
import {
  activeTheme,
  applyAppearance,
  migrateFromWarpforge,
  useAppearance,
} from "./lib/appearance";
import { attentionDelta, noticesFor } from "./lib/attention-notice";
import { useHistoryNotices } from "./lib/history-notices";
import { useNotificationActions } from "./lib/notification-action";
import { Shortcuts } from "./lib/shortcuts";
import { useTaskPullSync } from "./lib/task-pull";
import { useTaskSurface } from "./lib/task-surface";
import { useToolUpdatesPolling } from "./lib/tool-updates";
import { updater } from "./lib/updater";
import { useDaemon } from "./lib/use-daemon";
import { useTauriClose } from "./lib/use-quit";
import { needsPerson, visibleTasks } from "./model/tasks";
import { AppConfirms } from "./shell/app-confirms";
import { AppShell } from "./shell/app-shell";

export function App() {
  const appearance = useAppearance();

  const quit = useTauriClose();
  const daemonState = useDaemon();
  useTaskPullSync();
  useTaskSurface();
  useNotificationActions();
  useHistoryNotices();
  useToolUpdatesPolling();

  useEffect(() => {
    migrateFromWarpforge();
    void updater.initialize().then(() => updater.startAutoCheck());
  }, []);

  const sent = useRef<ReturnType<typeof noticesFor>>([]);
  useEffect(() => {
    const next = noticesFor(
      visibleTasks(daemonState.snapshot.tasks).filter(needsPerson),
      daemonState.sessionUpdates,
    );
    const delta = attentionDelta(sent.current, next);
    sent.current = next;
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      for (const notice of delta.withdraw) {
        void invoke("withdraw_attention", {
          payload: {
            kind: notice.kind,
            task_id: notice.taskId,
            request_id: notice.requestId ?? null,
          },
        }).catch(() => undefined);
      }
      if (document.hidden) {
        for (const notice of delta.notify) {
          void invoke("notify_attention", {
            payload: {
              kind: notice.kind,
              task_id: notice.taskId,
              request_id: notice.requestId ?? null,
              title: notice.title,
              subtitle: notice.subtitle,
              body: notice.body,
            },
          }).catch(() => undefined);
        }
      }
    });
  }, [daemonState.snapshot.tasks, daemonState.sessionUpdates]);

  useEffect(() => {
    applyAppearance(
      activeTheme(appearance.themeId),
      appearance.density,
      appearance.radius,
      appearance.fontSize,
      appearance.monoFontSize,
      {
        opacity: appearance.sidebarOpacity,
        bodyGlass: appearance.bodyGlass,
        transparent: appearance.transparentWindow,
        theo: appearance.theoMod,
      },
    );
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core")
      .then(async ({ invoke }) => {
        if (!appearance.transparentWindow) {
          await invoke("disable_window_glass");
          return;
        }
        await invoke("set_window_background_blur", { radius: appearance.blurRadius });
        await invoke("enable_window_glass");
      })
      .catch(() => {});
  }, [
    appearance.themeId,
    appearance.density,
    appearance.radius,
    appearance.fontSize,
    appearance.monoFontSize,
    appearance.sidebarOpacity,
    appearance.bodyGlass,
    appearance.transparentWindow,
    appearance.blurRadius,
    appearance.theoMod,
  ]);

  useEffect(() => applyAppIcon(appearance.appIcon), [appearance.appIcon]);

  return (
    <AppShell page={<PageContent />}>
      <Shortcuts />
      <NewTaskDialog />
      <PushDialog />
      <BranchDialog />
      <AppConfirms />
      <MergeWorktreeDialog />
      <AddProjectDialog />
      <SetupDialog />
      {quit && <QuitDialog quit={quit} />}
      <Toaster position="bottom-right" />
    </AppShell>
  );
}
