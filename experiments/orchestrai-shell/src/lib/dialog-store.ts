import { useMemo } from "react"
import { create } from "zustand"

import { useAppId } from "@/lib/app-instance"
import type { AppId } from "@/lib/apps"

export type DialogId = "palette" | "new-task" | "open-project"

/** Which dialog each window has open. Not persisted: dialogs always start closed. */
const useDialogStore = create<{
  open: Partial<Record<AppId, DialogId | null>>
  set: (app: AppId, dialog: DialogId | null) => void
}>()((set) => ({
  open: {},
  set: (app, dialog) => set(({ open }) => ({ open: { ...open, [app]: dialog } })),
}))

export function useDialog() {
  const app = useAppId()
  const current = useDialogStore((state) => state.open[app] ?? null)
  const setDialog = useDialogStore((state) => state.set)
  return useMemo(
    () => ({
      current,
      open: (dialog: DialogId) => setDialog(app, dialog),
      close: () => setDialog(app, null),
      toggle: (dialog: DialogId) =>
        setDialog(app, useDialogStore.getState().open[app] === dialog ? null : dialog),
    }),
    [app, current, setDialog]
  )
}
