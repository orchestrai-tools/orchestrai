import { cn } from "@warpforge/ui/lib/utils";
import { useEffect, useRef } from "react";

import { Markdown } from "../../components/markdown";
import { continuesAuthor, withDayBreaks } from "../../lib/channel-days";
import { channelMentionParts } from "../../lib/channel-mention";
import { formatElapsed } from "../../lib/live-line";
import { useShell } from "../../lib/shell-store";
import { AuthorMark, isAgentRole, type ChannelMessage } from "./author-mark";

function openFile(path: string, line: number) {
  useShell.getState().setFileJump({ path, line });
}

function stamp(at: number | undefined, now: number): string | null {
  return at != null && Number.isFinite(at) ? formatElapsed(at, now) : null;
}

function MessageRow({
  message,
  continued,
  name,
  mentionIds,
  known,
  now,
}: {
  message: ChannelMessage;
  continued: boolean;
  name: string;
  mentionIds: string[];
  known: ReadonlySet<string>;
  now: number;
}) {
  const agent = isAgentRole(message.role);
  const time = stamp(message.at, now);
  return (
    <li
      className={cn(
        "group/row flex gap-3 rounded-md px-2 hover:bg-muted/40",
        continued ? "py-0.5" : "pt-2 pb-0.5",
      )}
    >
      <div className="w-8 shrink-0">
        {continued ? (
          <span className="block pt-0.5 text-right text-xs text-muted-foreground tabular-nums opacity-0 group-hover/row:opacity-100">
            {time}
          </span>
        ) : (
          <AuthorMark name={name} agent={agent} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!continued && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{name}</span>
            {agent && <span className="text-xs text-muted-foreground">agent</span>}
            {time && <span className="text-xs text-muted-foreground">{time} ago</span>}
          </div>
        )}
        <div className="text-sm leading-relaxed">
          {channelMentionParts(message.body, mentionIds).map((part, index) =>
            part.kind === "mention" ? (
              <strong key={index} className="font-medium text-foreground">
                {part.text}
              </strong>
            ) : (
              <Markdown key={index} known={known} onOpenFile={openFile}>
                {part.text}
              </Markdown>
            ),
          )}
        </div>
      </div>
    </li>
  );
}

/** One shared thread, with day breaks and follow-ups from the same author folded under one name. */
export function Thread({
  messages,
  loading,
  nameOf,
  mentionIds,
  known,
}: {
  messages: ChannelMessage[];
  loading: boolean;
  nameOf: (message: ChannelMessage) => string;
  mentionIds: string[];
  known: ReadonlySet<string>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const now = Math.floor(Date.now() / 1000);
  const items = withDayBreaks(messages);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={scroller} className="-mx-2 min-h-0 flex-1 overflow-y-auto">
      <ol aria-label="Messages" className="flex flex-col">
        {items.map((item, index) =>
          item.kind === "day" ? (
            <li
              key={item.id}
              aria-label={item.label}
              className="flex items-center gap-3 px-2 py-3 text-xs text-muted-foreground"
            >
              <span aria-hidden className="h-px flex-1 bg-border" />
              {item.label}
              <span aria-hidden className="h-px flex-1 bg-border" />
            </li>
          ) : (
            <MessageRow
              key={item.message.id}
              message={item.message}
              continued={continuesAuthor(items, index)}
              name={nameOf(item.message)}
              mentionIds={mentionIds}
              known={known}
              now={now}
            />
          ),
        )}
      </ol>
      {loading && messages.length === 0 && (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">Loading messages…</p>
      )}
      {!loading && messages.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          No messages yet. People and agents share this room.
        </p>
      )}
    </div>
  );
}
