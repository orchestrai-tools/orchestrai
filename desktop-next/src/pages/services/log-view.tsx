import type { LogEntry } from "@warpforge/daemon/types";
import { Button } from "@warpforge/ui/components/button";
import { Toggle } from "@warpforge/ui/components/toggle";
import { cn } from "@warpforge/ui/lib/utils";
import { ArrowDownIcon, RotateCwIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { entriesMatchingSelection } from "../../lib/log-context";
import { plural } from "../../lib/plural";
import { AttachMenu } from "./attach-menu";
import { attachLogs, copyText, type RuntimeKind } from "./runtime-actions";

const FOLLOW_THRESHOLD_PX = 40;

function clock(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-GB", { hour12: false });
}

function tone(text: string): string {
  if (text.startsWith("[service failed") || text.startsWith("✗"))
    return "text-red-600 dark:text-red-400";
  if (
    text.startsWith("[service running]") ||
    text.startsWith("[service ready]") ||
    text.startsWith("✓")
  ) {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (text.startsWith("[service") || text.startsWith("[warn]")) return "text-muted-foreground";
  return "";
}

function LineText({ text }: { text: string }) {
  if (!text.startsWith("[err] ")) return <span className={tone(text)}>{text}</span>;
  return (
    <span>
      <span className="select-none text-muted-foreground" title="Written to stderr">
        err{" "}
      </span>
      {text.slice(6)}
    </span>
  );
}

/**
 * A live log: filter it, pick a range by its line numbers, and hand that range
 * to a task. It follows new lines until you scroll up. Command-L attaches the
 * picked range, or the text selected in the log, to the open conversation.
 */
export function LogView({
  project,
  kind,
  name,
  lines,
  onRefresh,
}: {
  project: string;
  kind: RuntimeKind;
  name: string;
  lines: LogEntry[];
  onRefresh: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [behind, setBehind] = useState(false);
  const [filter, setFilter] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [range, setRange] = useState<{ anchor: number; from: number; to: number } | null>(null);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? lines.filter((line) => line.line.toLowerCase().includes(needle)) : lines;
  const picked = range
    ? lines.filter((line) => line.seq >= range.from && line.seq <= range.to)
    : [];
  const target = range ? picked : shown;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [shown.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "l") return;
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const inLog = Boolean(node && scrollRef.current?.contains(node));
      const entries = inLog ? entriesMatchingSelection(lines, selection?.toString() ?? "") : picked;
      if (entries.length === 0) return;
      event.preventDefault();
      attachLogs(project, kind, name, entries);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines, picked, project, kind, name]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.clientHeight - element.scrollTop <= FOLLOW_THRESHOLD_PX;
    following.current = atBottom;
    setBehind(!atBottom);
  };

  const jump = () => {
    following.current = true;
    setBehind(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  };

  const pick = (seq: number, extend: boolean) =>
    setRange((current) =>
      extend && current
        ? {
            anchor: current.anchor,
            from: Math.min(current.anchor, seq),
            to: Math.max(current.anchor, seq),
          }
        : { anchor: seq, from: seq, to: seq },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 px-4 py-1.5">
        <label className="flex h-7 w-56 max-w-full items-center gap-1.5 rounded-md border bg-background px-2 text-xs focus-within:ring-2 focus-within:ring-ring/50">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter lines"
            aria-label={`Filter ${name} logs`}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Toggle
          size="sm"
          pressed={timestamps}
          onPressedChange={setTimestamps}
          className="h-7 px-2 text-xs"
          aria-label="Show timestamps"
        >
          Time
        </Toggle>
        <span className="text-xs text-muted-foreground tabular-nums">
          {needle
            ? `${shown.length} of ${plural(lines.length, "line")}`
            : plural(lines.length, "line")}
        </span>
        <span className="ml-auto flex max-w-full flex-wrap items-center gap-1">
          {range ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {range.from === range.to ? `Line ${range.from}` : `Lines ${range.from}–${range.to}`}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh logs"
              title="Refresh logs"
              onClick={onRefresh}
            >
              <RotateCwIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="text-xs"
            disabled={target.length === 0}
            onClick={() => copyText(target.map((line) => line.line).join("\n"))}
          >
            {range ? "Copy" : "Copy all"}
          </Button>
          <AttachMenu project={project} kind={kind} name={name} entries={target} />
          {range && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear selection"
              onClick={() => setRange(null)}
            >
              <XIcon />
            </Button>
          )}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-4 pb-3 font-mono text-xs leading-relaxed"
        >
          {shown.length === 0 ? (
            <p className="py-2 font-sans text-muted-foreground">
              {needle
                ? `No line contains “${filter}”.`
                : `No logs yet. They appear here as soon as ${name} starts.`}
            </p>
          ) : (
            shown.map((line) => {
              const inRange = range !== null && line.seq >= range.from && line.seq <= range.to;
              return (
                <div key={line.seq} className={cn("flex gap-3 rounded-sm", inRange && "bg-muted")}>
                  <button
                    type="button"
                    onClick={(event) => pick(line.seq, event.shiftKey)}
                    title="Select this line; Shift-click to extend"
                    className="w-10 shrink-0 select-none text-right text-muted-foreground/70 tabular-nums hover:text-foreground"
                  >
                    {line.seq}
                  </button>
                  {timestamps && (
                    <span className="w-16 shrink-0 select-none text-muted-foreground tabular-nums">
                      {clock(line.at)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                    <LineText text={line.line} />
                  </span>
                </div>
              );
            })
          )}
        </div>
        {behind && (
          <Button
            variant="outline"
            size="xs"
            onClick={jump}
            className="absolute right-4 bottom-3 text-xs shadow-sm"
          >
            <ArrowDownIcon />
            Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}
