import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { lineLabel, type DiffNote } from "@/lib/diffNotes";
import { cn } from "@/lib/utils";

import type { NoteDraft } from "./DiffNotesContext";

// The slot sits inside the editor's content, which sets mono type, `pre` and a text cursor.
const SLOT = "cursor-auto whitespace-normal px-2.5 py-1.5 font-sans";
const ACTION = "h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground";

/**
 * A saved review note under the lines it is about.
 * @param note The note.
 * @param outdated Its quoted lines are no longer in the file.
 * @param onEdit Opens the note in the composer; drafts only.
 * @param onResend Queues a sent note for the next batch.
 * @param onRemove Deletes the note.
 * @returns The card.
 */
export function NoteCard({
  note,
  outdated,
  onEdit,
  onResend,
  onRemove,
}: {
  note: DiffNote;
  outdated: boolean;
  onEdit: () => void;
  onResend: () => void;
  onRemove: () => void;
}) {
  const sent = !!note.sentAt;
  return (
    <div className={SLOT}>
      <div className="flex max-w-[80ch] flex-col gap-1 rounded-md border border-border bg-card p-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {note.path}:{lineLabel(note)}
          </span>
          {outdated && <Badge tone="warn">Outdated</Badge>}
          <Badge tone={sent ? "ok" : "muted"}>{sent ? "Sent" : "Not sent"}</Badge>
        </div>
        {outdated && note.snippet.length > 0 && (
          <pre className="max-h-24 overflow-auto rounded bg-secondary/50 px-2 py-1 font-mono text-[11px] text-muted-foreground line-through">
            {note.snippet.join("\n")}
          </pre>
        )}
        <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
        <div className="flex items-center justify-end gap-1">
          {sent ? (
            <Button type="button" variant="ghost" size="sm" className={ACTION} onClick={onResend}>
              Resend
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" className={ACTION} onClick={onEdit}>
              Edit
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className={ACTION} onClick={onRemove}>
            {sent ? "Resolve" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "muted"; children: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "muted" && "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/**
 * The box a note is written in. ⌘⏎ saves, Esc cancels.
 * @param draft The note being written.
 * @param onChange Receives the typed text.
 * @param onSave Stores the note.
 * @param onCancel Drops the draft.
 * @returns The composer.
 */
export function NoteComposer({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: NoteDraft;
  onChange: (body: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.body]);

  return (
    <div className={SLOT}>
      <div className="flex max-w-[80ch] flex-col gap-1.5 rounded-md border border-border bg-card p-2.5">
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          Note on {draft.path}:{lineLabel(draft)}
        </p>
        <Textarea
          ref={area}
          autoFocus
          value={draft.body}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.stopPropagation();
              onSave();
            }
          }}
          placeholder="What should the agent change here? (⌘⏎ to save)"
          aria-label="Review note"
          className="max-h-80 min-h-16 resize-none overflow-y-auto border-border bg-background/40 text-sm"
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[13px]"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[13px]"
            disabled={!draft.body.trim()}
            onClick={onSave}
          >
            {draft.noteId ? "Save note" : "Add note"}
          </Button>
        </div>
      </div>
    </div>
  );
}
