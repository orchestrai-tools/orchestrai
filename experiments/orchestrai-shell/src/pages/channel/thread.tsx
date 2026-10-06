import { useEffect, useRef } from "react"

import { StatusDot } from "@/components/common/status-mark"
import { findAgent, type AgentId } from "@/data/agents"
import { findPerson, type Author, type ChannelMessage } from "@/data/channel"
import { findTask } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { AuthorMark } from "@/pages/channel/author-mark"
import { InlineText } from "@/pages/channel/inline-text"

type Message = Extract<ChannelMessage, { type: "message" }>

const sameAuthor = (a: Author, b: Author) => a.kind === b.kind && a.id === b.id

function MessageRow({ message, continued, onOpenTask }: { message: Message; continued: boolean; onOpenTask: (id: string) => void }) {
  const isAgent = message.author.kind === "agent"
  const name = message.author.kind === "agent" ? findAgent(message.author.id).name : findPerson(message.author.id).name
  const task = findTask(message.task)

  return (
    <li className={cn("group/row flex gap-3 rounded-md px-2 hover:bg-muted/40", continued ? "py-0.5" : "pt-2 pb-0.5")}>
      <div className="w-8 shrink-0">
        {continued ? (
          <span className="block pt-0.5 text-right text-xs text-muted-foreground tabular-nums opacity-0 group-hover/row:opacity-100">
            {message.time.replace(/ [AP]M$/, "")}
          </span>
        ) : (
          <AuthorMark author={message.author} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{name}</span>
            {isAgent && <span className="text-xs text-muted-foreground">agent</span>}
            <span className="text-xs text-muted-foreground">{message.time}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed">
          <InlineText text={message.text} mentions />
        </p>
        {task && (
          <button
            type="button"
            onClick={() => onOpenTask(task.id)}
            className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatusDot status={task.status} />
            <span className="font-mono">{task.id}</span>
            <span className="truncate">{task.title}</span>
          </button>
        )}
      </div>
    </li>
  )
}

/** One shared thread. Agent replies carry the task they belong to, so a reply is never context-free. */
export function Thread({ topic, messages, typing }: { topic: string; messages: ChannelMessage[]; typing: AgentId[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const { select } = useAppActions()

  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, typing.length])

  return (
    <div ref={scroller} className="-mx-2 min-h-0 flex-1 overflow-y-auto">
      <p className="px-2 pb-2 text-xs text-muted-foreground">{topic}</p>
      <ol aria-label="Messages" className="flex flex-col">
        {messages.map((message, index) => {
          if (message.type === "day") {
            return (
              <li key={message.id} aria-label={message.text} className="flex items-center gap-3 px-2 py-3 text-xs text-muted-foreground">
                <span aria-hidden className="h-px flex-1 bg-border" />
                {message.text}
                <span aria-hidden className="h-px flex-1 bg-border" />
              </li>
            )
          }
          if (message.type === "event") {
            return (
              <li key={message.id} className="flex gap-3 px-2 py-1 text-xs text-muted-foreground">
                <span className="w-8 shrink-0" />
                <span>
                  {message.text} · {message.time}
                </span>
              </li>
            )
          }
          const previous = messages[index - 1]
          const continued = previous?.type === "message" && sameAuthor(previous.author, message.author)
          return <MessageRow key={message.id} message={message} continued={continued} onOpenTask={(id) => select("task", id, "task")} />
        })}
      </ol>
      <p aria-live="polite" className="h-6 px-2 pt-1 text-xs text-muted-foreground">
        {typing.length > 0 &&
          `${typing.map((id) => findAgent(id).name).join(" and ")} ${typing.length === 1 ? "is" : "are"} replying…`}
      </p>
    </div>
  )
}
