import { useMemo } from "react"
import { create } from "zustand"

import {
  FACTORY,
  FACTORY_DEFAULTS,
  taskIdFor,
  workItemsFor,
  type FactoryEntry,
  type FactorySettings,
  type WorkItem,
} from "@/data/backlog"
import { DISK } from "@/data/git"
import type { ProjectId } from "@/lib/projects"
import { say } from "@/pages/changes/toast-store"
import { issueSource, usePulls } from "@/pages/github/github-store"

interface BacklogStore {
  patches: Record<string, Partial<WorkItem>>
  created: WorkItem[]
  deleted: string[]
  factory: Partial<Record<ProjectId, FactoryEntry[]>>
  settings: Partial<Record<ProjectId, FactorySettings>>
  synced: Partial<Record<ProjectId, string>>
  patch: (id: string, patch: Partial<WorkItem>) => void
  create: (item: WorkItem) => void
  remove: (id: string) => void
  setFactory: (project: ProjectId, update: (entries: FactoryEntry[]) => FactoryEntry[]) => void
  saveSettings: (project: ProjectId, settings: FactorySettings) => void
  sync: (project: ProjectId) => void
}

const seededFactory = Object.fromEntries(Object.entries(FACTORY).map(([project, value]) => [project, value?.entries ?? []])) as Partial<Record<ProjectId, FactoryEntry[]>>

export const useBacklogStore = create<BacklogStore>()((set) => ({
  patches: {},
  created: [],
  deleted: [],
  factory: seededFactory,
  settings: {},
  synced: {},
  patch: (id, patch) => set((store) => ({ patches: { ...store.patches, [id]: { ...store.patches[id], ...patch, updated: "Just now", age: 0 } } })),
  create: (item) => set((store) => ({ created: [item, ...store.created] })),
  remove: (id) => set((store) => ({ deleted: [...store.deleted, id] })),
  setFactory: (project, update) => set((store) => ({ factory: { ...store.factory, [project]: update(store.factory[project] ?? []) } })),
  saveSettings: (project, settings) => set((store) => ({ settings: { ...store.settings, [project]: settings } })),
  sync: (project) => set((store) => ({ synced: { ...store.synced, [project]: "just now" } })),
}))

/** The project's backlog as the daemon would list it: the data, plus every edit made here. */
export function useWorkItems(project: ProjectId): WorkItem[] {
  const patches = useBacklogStore((store) => store.patches)
  const created = useBacklogStore((store) => store.created)
  const deleted = useBacklogStore((store) => store.deleted)
  return useMemo(
    () =>
      [...created.filter((item) => item.project === project), ...workItemsFor(project)]
        .filter((item) => !deleted.includes(item.id))
        .map((item) => ({ ...item, ...patches[item.id] })),
    [created, deleted, patches, project]
  )
}

/** The started-task store key for an item: a GitHub item shares its issue's key, so both pages show one task. */
export function sourceKey(item: WorkItem) {
  return item.source === "github" ? issueSource(item.project, Number(item.number.slice(1))) : `item:${item.id}`
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** Why no queued Factory task starts right now, judged the way the daemon judges it on every pass. */
export function factoryHold(entries: FactoryEntry[], settings: FactorySettings, startedToday: number, openPrs: number): string | undefined {
  const inFlight = entries.filter((entry) => entry.state === "running" || entry.state === "delivering").length
  if (inFlight >= settings.maxConcurrent) return `${inFlight} of ${settings.maxConcurrent} running at once`
  if (openPrs >= settings.maxOpenPrs) return `${openPrs} of ${settings.maxOpenPrs} draft pull requests are open; the next starts when one merges or closes`
  if (startedToday >= settings.maxPerDay) return `${startedToday} of ${settings.maxPerDay} started in the last 24 hours`
  if (DISK.freeGb < settings.minFreeGb) return `${DISK.free} free, below the ${settings.minFreeGb} GB floor`
  return undefined
}

const NO_ENTRIES: FactoryEntry[] = []

export function useFactory(project: ProjectId) {
  const entries = useBacklogStore((store) => store.factory[project]) ?? NO_ENTRIES
  const settings = useBacklogStore((store) => store.settings[project]) ?? FACTORY_DEFAULTS
  const pulls = usePulls(project)
  const startedToday = FACTORY[project]?.startedToday ?? 0
  const openPrs = entries.filter((entry) => {
    const state = pulls.find((pull) => pull.number === entry.pr)?.state
    return entry.state === "delivered" && (state === "draft" || state === "open")
  }).length
  return { entries, settings, startedToday, hold: entries.some((entry) => entry.state === "queued") ? factoryHold(entries, settings, startedToday, openPrs) : undefined }
}

/** Factory actions for one project. Only a person queues an item, and one item has one Factory task at a time. */
export function factoryActions(project: ProjectId) {
  const { setFactory, patch } = useBacklogStore.getState()
  return {
    enqueue: (items: WorkItem[]) => {
      const entries = useBacklogStore.getState().factory[project] ?? []
      const skipped = items.filter((item) => entries.some((entry) => entry.item === item.id) || item.status === "done" || item.status === "cancelled")
      const queued = items.filter((item) => !skipped.includes(item))
      setFactory(project, (current) => [...current, ...queued.map((item): FactoryEntry => ({ item: item.id, task: taskIdFor(item), state: "queued" }))])
      say(`Queued ${plural(queued.length, "Factory task")}${skipped.length ? ` · skipped ${skipped.map((item) => item.number).join(", ")} (already in the Factory or closed)` : ""}`)
    },
    startNow: (entry: FactoryEntry, item?: WorkItem) => {
      if (entry.wait) {
        say(`Cannot start ${item?.number ?? entry.task} now: ${entry.wait}`, "error")
        return
      }
      setFactory(project, (current) => current.map((candidate) => (candidate === entry ? { ...candidate, state: "running" } : candidate)))
      if (item) patch(item.id, { status: "in_progress", task: entry.task })
      say(`Started ${entry.task} past the queue limits`)
    },
    dequeue: (entry: FactoryEntry, item?: WorkItem) => {
      setFactory(project, (current) => current.filter((candidate) => candidate !== entry))
      say(`Removed ${item?.number ?? entry.task} from the Factory queue`)
    },
    stopAll: (items: WorkItem[]) => {
      const entries = useBacklogStore.getState().factory[project] ?? []
      const stopping = entries.filter((entry) => entry.state === "queued" || entry.state === "running")
      for (const entry of stopping) {
        const item = items.find((candidate) => candidate.id === entry.item)
        if (item && entry.state === "running") patch(item.id, { status: "todo" })
      }
      setFactory(project, (current) => current.filter((entry) => !stopping.includes(entry)))
      say(`Stopped ${plural(stopping.length, "Factory task")}; their work so far stays where it is`)
    },
  }
}
