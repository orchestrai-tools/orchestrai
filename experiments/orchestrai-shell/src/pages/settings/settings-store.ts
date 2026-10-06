import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { ProjectId } from "@/lib/projects"

/** Mock values for every control, keyed `project:setting` or `app:setting`, so each project keeps its own. */
const useSettingsValues = create<{ values: Record<string, unknown>; set: (key: string, value: unknown) => void }>()(
  persist(
    (set) => ({
      values: {},
      set: (key, value) => set(({ values }) => ({ values: { ...values, [key]: value } })),
    }),
    { name: "experiments.orchestrai-shell.settings-values" }
  )
)

export function useSetting<T>(key: string, fallback: T): [T, (value: T) => void] {
  const stored = useSettingsValues((state) => state.values[key]) as T | undefined
  const set = useSettingsValues((state) => state.set)
  return [stored === undefined ? fallback : stored, (value: T) => set(key, value)]
}

export function useProjectSetting<T>(project: ProjectId, key: string, fallback: T): [T, (value: T) => void] {
  return useSetting(`${project}:${key}`, fallback)
}

export function useAppSetting<T>(key: string, fallback: T): [T, (value: T) => void] {
  return useSetting(`app:${key}`, fallback)
}
