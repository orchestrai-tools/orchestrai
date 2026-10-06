import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { CopyIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { previousChangeText } from "../../lib/change-previous";

/**
 * The changed line in hand: what it was at the last commit, and the actions
 * on just this change. The palette commits by clicking the button right after
 * the message field, so the two stay adjacent.
 */
export function ChangeStrip({
  oldText,
  draft,
  line,
  busy,
  onRevert,
  onCopy,
  onCommit,
}: {
  oldText: string;
  draft: string;
  line: number;
  busy: boolean;
  onRevert: () => void;
  onCopy: () => void;
  onCommit: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState("");
  const previous = previousChangeText(oldText, draft, line + 1);
  const text = message.trim();

  async function submit() {
    if (!text || busy) return;
    if (await onCommit(text)) setMessage("");
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/30 px-3 py-2">
      {previous && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">At the last commit</span>
          <pre className="max-h-24 overflow-auto rounded-sm bg-red-500/10 px-2 py-1 font-mono text-xs whitespace-pre-wrap">
            {previous}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground tabular-nums">Line {line + 1}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRevert}>
          <Undo2Icon />
          Revert this change
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={onCopy}>
          <CopyIcon />
          Copy this change
        </Button>
        <div className="ml-auto flex min-w-64 flex-1 items-center gap-1.5">
          <Input
            aria-label="Commit this change"
            placeholder="Commit this file with a message"
            value={message}
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void submit();
            }}
            className="h-7 text-xs"
          />
          <Button type="button" size="xs" disabled={!text || busy} onClick={() => void submit()}>
            {busy ? "Committing…" : "Commit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
