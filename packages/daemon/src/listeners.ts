/** A query key the app should refetch. The daemon package stays free of React Query. */
export type QueryKey = readonly unknown[]

export interface DaemonNotice {
  tone: "warning" | "info"
  message: string
  duration?: number
}

type InvalidateListener = (queryKey: QueryKey) => void
type TaskRemovedListener = (taskId: string) => void
type NoticeListener = (notice: DaemonNotice) => void

const invalidateListeners = new Set<InvalidateListener>()
const taskRemovedListeners = new Set<TaskRemovedListener>()
const noticeListeners = new Set<NoticeListener>()

/** The app registers this once, and points it at its own query cache. */
export function onInvalidate(listener: InvalidateListener): () => void {
  invalidateListeners.add(listener)
  return () => invalidateListeners.delete(listener)
}

/** The app drops the deleted task's local workspace session. */
export function onTaskRemoved(listener: TaskRemovedListener): () => void {
  taskRemovedListeners.add(listener)
  return () => taskRemovedListeners.delete(listener)
}

/** The app turns these into toasts. The daemon package does not import a toast library. */
export function onNotice(listener: NoticeListener): () => void {
  noticeListeners.add(listener)
  return () => noticeListeners.delete(listener)
}

export function emitNotice(notice: DaemonNotice): void {
  for (const listener of noticeListeners) listener(notice)
}

export function emitInvalidate(queryKey: QueryKey): void {
  for (const listener of invalidateListeners) listener(queryKey)
}

export function emitTaskRemoved(taskId: string): void {
  for (const listener of taskRemovedListeners) listener(taskId)
}
