import { useEffect, useRef, useState, type FormEvent } from "react"
import { SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
}

const TRANSCRIPT: ChatMessage[] = [
  { id: "m1", role: "user", text: "I'm building a chat for our app and the scroll keeps jumping while replies stream." },
  { id: "m2", role: "assistant", text: "That usually happens when the list pins itself to the bottom on every update. The reader loses their place whenever a token arrives." },
  { id: "m3", role: "user", text: "So what should it do instead?" },
  { id: "m4", role: "assistant", text: "Anchor each new turn near the top of the viewport, then let the answer grow into the screen. Only follow the stream while the reader is already at the live edge." },
  { id: "m5", role: "user", text: "And if they scroll up to re-read something?" },
  { id: "m6", role: "assistant", text: "Leave them there. Show a button to jump back to the latest reply, and resume following once they use it." },
]

const REPLIES = [
  "Good question. The scroller anchors your message near the top, keeps a peek of the previous turn above it, and lets this reply stream in underneath without moving the page.",
  "Try scrolling up while this streams. The view stays where you left it, and the round button at the bottom takes you back to the newest message.",
  "Long threads stay responsive because rows that are off screen skip layout and paint until they scroll back into view.",
]

const STREAM_INTERVAL_MS = 45

/** Message Scroller with a saved transcript and simulated streamed replies. */
export function ChatDemo() {
  const [messages, setMessages] = useState(TRANSCRIPT)
  const [draft, setDraft] = useState("")
  const [streaming, setStreaming] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const replyIndex = useRef(0)

  useEffect(() => () => window.clearInterval(timer.current), [])

  const send = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || streaming) return

    const reply = REPLIES[replyIndex.current++ % REPLIES.length].split(" ")
    const assistantId = crypto.randomUUID()
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text },
      { id: assistantId, role: "assistant", text: "" },
    ])
    setDraft("")
    setStreaming(true)

    let words = 0
    timer.current = window.setInterval(() => {
      words += 1
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, text: reply.slice(0, words).join(" ") } : message
        )
      )
      if (words >= reply.length) {
        window.clearInterval(timer.current)
        setStreaming(false)
      }
    }, STREAM_INTERVAL_MS)
  }

  return (
    <Card className="flex h-[min(72svh,680px)] flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Message Scroller</CardTitle>
        <CardDescription>Send a message: your turn anchors near the top while the reply streams in.</CardDescription>
      </CardHeader>

      <MessageScrollerProvider>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {messages.map((message) => {
                const mine = message.role === "user"
                return (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={mine}>
                    <Message align={mine ? "end" : "start"}>
                      <MessageContent>
                        <p
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3 py-2 leading-relaxed",
                            mine ? "self-end bg-primary text-primary-foreground" : "bg-muted"
                          )}
                        >
                          {message.text || "…"}
                        </p>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <Input
          aria-label="Message"
          placeholder={streaming ? "Replying…" : "Ask about scroll behavior…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={!draft.trim() || streaming}>
          <SendIcon />
          Send
        </Button>
      </form>
    </Card>
  )
}
