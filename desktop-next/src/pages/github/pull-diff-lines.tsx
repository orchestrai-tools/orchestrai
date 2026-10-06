import type { PullComment } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { Markdown } from "../../components/markdown";
import type { LineDraft, PatchLine } from "../../lib/pull-diff";
import { commentHeading } from "../../lib/pull-thread";

export type Side = "LEFT" | "RIGHT";
export type LineRef = { path: string; side: Side; line: number };
export type Reply = { threadId: string; body: string };

const KIND: Record<string, string> = {
  add: "bg-emerald-500/10",
  del: "bg-red-500/10",
  meta: "text-muted-foreground",
  context: "",
};

/** Lines of one hunk side. Press a line number to start a comment; drag or shift-click to span lines. */
export function LineList({
  lines,
  path,
  side,
  comments,
  draft,
  chooseLine,
  dragging,
  reply,
  setReply,
  onSendReply,
}: {
  lines: Array<PatchLine | null>;
  path: string;
  side?: Side;
  comments?: Map<number, PullComment[]>;
  draft: LineDraft | null;
  chooseLine: (next: LineRef, extend: boolean) => void;
  dragging: { current: boolean };
  reply: Reply | null;
  setReply: (reply: Reply | null) => void;
  onSendReply: () => void;
}) {
  return (
    <div className="min-w-0 overflow-x-auto font-mono text-xs leading-5">
      {lines.map((line, index) => {
        if (!line) return <div key={`empty-${index}`} className="h-5 bg-muted/30" />;
        const anchorSide: Side = side ?? (line.kind === "del" ? "LEFT" : "RIGHT");
        const anchor = anchorSide === "LEFT" ? line.oldNumber : line.newNumber;
        const shown = anchorSide === "RIGHT" && anchor ? comments?.get(anchor) : undefined;
        const selected =
          !!anchor &&
          draft?.path === path &&
          draft.side === anchorSide &&
          anchor >= draft.startLine &&
          anchor <= draft.line;
        return (
          <div key={line.id}>
            <div
              data-kind={line.kind}
              className={cn("flex", selected ? "bg-sky-500/20" : KIND[line.kind])}
              onPointerOver={() => {
                if (!anchor || !dragging.current) return;
                chooseLine({ path, side: anchorSide, line: anchor }, true);
              }}
            >
              <button
                type="button"
                disabled={!anchor}
                aria-label={anchor ? `Comment on line ${anchor}` : undefined}
                onPointerDown={(event) => {
                  if (!anchor || event.button !== 0) return;
                  event.preventDefault();
                  dragging.current = !event.shiftKey;
                  chooseLine({ path, side: anchorSide, line: anchor }, event.shiftKey);
                }}
                onClick={(event) => {
                  if (!anchor || event.detail !== 0) return;
                  chooseLine({ path, side: anchorSide, line: anchor }, event.shiftKey);
                }}
                className="w-10 shrink-0 pr-2 text-right text-muted-foreground select-none enabled:hover:text-foreground"
              >
                {anchor ?? ""}
              </button>
              <span className="whitespace-pre">{line.text || " "}</span>
            </div>
            {shown?.map((comment) => (
              <div
                key={comment.id}
                className="my-1 ml-10 flex flex-col gap-1 rounded-md border bg-background p-2 font-sans"
              >
                <span className="text-xs font-medium">{commentHeading(comment)}</span>
                {comment.body.trim() && (
                  <Markdown allowHtml className="text-sm">
                    {comment.body}
                  </Markdown>
                )}
                {comment.replies.map((item) => (
                  <div key={item.id} className="flex flex-col gap-0.5 border-l pl-2">
                    <span className="text-xs text-muted-foreground">{commentHeading(item)}</span>
                    {item.body.trim() && (
                      <Markdown allowHtml className="text-sm">
                        {item.body}
                      </Markdown>
                    )}
                  </div>
                ))}
                {comment.threadId && reply?.threadId !== comment.threadId && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="self-start text-muted-foreground"
                    onClick={() => setReply({ threadId: comment.threadId ?? "", body: "" })}
                  >
                    Reply
                  </Button>
                )}
                {comment.threadId && reply?.threadId === comment.threadId && (
                  <form
                    className="flex flex-col gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSendReply();
                    }}
                  >
                    <Textarea
                      autoFocus
                      value={reply.body}
                      aria-label={`Reply to ${commentHeading(comment)}`}
                      onChange={(event) =>
                        setReply({ threadId: comment.threadId ?? "", body: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setReply(null);
                          return;
                        }
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          onSendReply();
                        }
                      }}
                      className="min-h-14 text-sm"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setReply(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="xs">
                        Reply
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
