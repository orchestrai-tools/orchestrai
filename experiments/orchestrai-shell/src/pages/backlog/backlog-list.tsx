import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { FactoryEntry, Priority, WorkItem } from "@/data/backlog"
import { BacklogRow, type LinkedTask } from "@/pages/backlog/backlog-row"

/** Rows arrive by scrolling, a page at a time: there is no page to be on, so no pager can disagree with the rows. */
const PAGE_SIZE = 30

interface Props {
  rows: WorkItem[]
  entryOf: (item: WorkItem) => FactoryEntry | undefined
  taskOf: (item: WorkItem) => LinkedTask | undefined
  selectedId?: string
  checked: ReadonlySet<string>
  onSelect: (id: string) => void
  onCheck: (id: string, on: boolean) => void
  onPriority: (item: WorkItem, priority: Priority) => void
  onStart: (item: WorkItem) => void
  onOpenTask: (id: string) => void
  empty: string
}

export function BacklogList({ rows, entryOf, taskOf, selectedId, checked, onSelect, onCheck, onPriority, onStart, onOpenTask, empty }: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const more = visible < rows.length

  useEffect(() => {
    const node = sentinel.current
    if (!node || !more || loading) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setLoading(true)
        timer = setTimeout(() => {
          setVisible((count) => count + PAGE_SIZE)
          setLoading(false)
        }, 450)
      },
      { root: scroller.current, rootMargin: "120px" }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [more, loading])

  const move = (event: KeyboardEvent) => {
    const step = event.key === "j" || event.key === "ArrowDown" ? 1 : event.key === "k" || event.key === "ArrowUp" ? -1 : 0
    if (!step || !rows.length || (event.target as HTMLElement).closest("[role=menu]")) return
    event.preventDefault()
    const index = rows.findIndex((item) => item.id === selectedId)
    onSelect(rows[Math.min(rows.length - 1, Math.max(0, index + step))].id)
  }

  return (
    <div ref={scroller} role="list" aria-label="Work items, J and K move" onKeyDown={move} className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      {rows.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">{empty}</p>}
      {rows.slice(0, visible).map((item) => (
        <BacklogRow
          key={item.id}
          item={item}
          entry={entryOf(item)}
          task={taskOf(item)}
          selected={item.id === selectedId}
          checked={checked.has(item.id)}
          selecting={checked.size > 0}
          onSelect={() => onSelect(item.id)}
          onCheck={(on) => onCheck(item.id, on)}
          onPriority={(priority) => onPriority(item, priority)}
          onStart={() => onStart(item)}
          onOpenTask={onOpenTask}
        />
      ))}
      {more && (
        <div ref={sentinel} className="flex flex-col gap-2 px-2 py-2" aria-label="Loading more">
          {loading && [0, 1, 2].map((index) => <Skeleton key={index} className="h-5 w-full" />)}
        </div>
      )}
      {!more && rows.length > PAGE_SIZE && <p className="py-3 text-center text-xs text-muted-foreground">End of backlog · {rows.length} items</p>}
    </div>
  )
}
