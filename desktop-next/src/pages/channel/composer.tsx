import { Button } from "@warpforge/ui/components/button";
import { Kbd } from "@warpforge/ui/components/kbd";
import { cn } from "@warpforge/ui/lib/utils";
import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  applyMention,
  mentionMatches,
  mentionQuery,
  type ChannelMention,
} from "../../lib/channel-mention";

/**
 * The message box for the shared room. `@` suggests the enabled agents. The
 * palette finds this field by its label, so the label must stay as it is.
 */
export function Composer({
  value,
  onChange,
  onPost,
  agents,
  channelName,
  input,
}: {
  value: string;
  onChange: (value: string) => void;
  onPost: (role: "human" | "agent") => void;
  agents: ChannelMention[];
  channelName: string;
  input?: RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const field = input ?? own;
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const query = mentionQuery(value, caret);
  const matches = query && query.start !== dismissedAt ? mentionMatches(agents, query.text) : [];
  const highlighted = Math.min(active, Math.max(matches.length - 1, 0));

  const pick = (agent: ChannelMention) => {
    if (!query) return;
    const next = applyMention(value, query.start, caret, agent.id);
    onChange(next.value);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0 && query) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((highlighted + step + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(matches[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedAt(query.start);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onPost("human");
    }
  };

  return (
    <div className="relative">
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention an agent"
          className="absolute bottom-full left-0 z-10 mb-1 w-96 max-w-full rounded-md bg-popover p-1 shadow-md ring-1 ring-foreground/10"
        >
          {matches.map((agent, index) => (
            <li key={agent.id} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(agent);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-sm",
                  index === highlighted && "bg-accent",
                )}
              >
                <span className="font-medium">@{agent.id}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {agent.name} · agent
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <textarea
          ref={field}
          rows={1}
          value={value}
          aria-label="Channel message"
          placeholder={`Message ${channelName}`}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
            setActive(0);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" variant="ghost" onClick={() => onPost("agent")} disabled={!value.trim()}>
          Post as agent
        </Button>
        <Button size="sm" onClick={() => onPost("human")} disabled={!value.trim()}>
          Send
        </Button>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Type @ to mention an agent.</span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> new line
        </span>
      </p>
    </div>
  );
}
