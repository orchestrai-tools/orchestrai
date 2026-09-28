import { ChevronDown, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { lineLabel, sortNotes } from "@/lib/diffNotes";
import { cn } from "@/lib/utils";

import { useDiffNotes } from "./DiffNotesContext";

function plural(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`;
}

/**
 * The strip above the task diff that counts review notes and sends them.
 * @param onJump Brings a file's diff into view.
 * @returns The strip, or nothing while there are no notes.
 */
export function DiffNotesBar({ onJump }: { onJump: (path: string) => void }) {
  const api = useDiffNotes();
  const [open, setOpen] = useState(false);
  if (!api || api.notes.length === 0) return null;

  const drafts = api.notes.filter((note) => !note.sentAt).length;
  const resending = drafts === 0;
  const label = `${resending ? "Resend" : "Send"} ${plural(api.batch.length)}`;
  const title =
    api.blocked ??
    (api.busy
      ? "The agent is working — the notes wait in its queue and go out as one message when it finishes"
      : resending
        ? "Send the notes you have not resolved again, as one message"
        : "Send the unsent notes to the agent as one message");

  return (
    <div className="border-b border-border bg-secondary/40 text-[13px]">
      <div className="flex h-9 items-center gap-2 px-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
          <MessageSquarePlus className="size-3.5" />
          <span className="truncate">
            {plural(api.notes.length)}
            {drafts > 0 && drafts < api.notes.length ? ` · ${drafts} not sent` : ""}
          </span>
        </button>
        {api.error && (
          <span className="min-w-0 truncate text-destructive" title={api.error}>
            {api.error}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant={resending ? "outline" : "default"}
          className="h-6 shrink-0 gap-1 px-2 text-[12px]"
          disabled={!!api.blocked || api.sending}
          title={title}
          onClick={() => void api.send()}
        >
          {api.sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          {label}
        </Button>
      </div>
      {open && (
        <ul className="max-h-48 overflow-auto border-t border-border py-1">
          {sortNotes(api.notes).map((note) => (
            <li key={note.id} className="flex items-center gap-2 px-2.5 py-0.5">
              <button
                type="button"
                onClick={() => onJump(note.path)}
                className="shrink-0 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {note.path}:{lineLabel(note)}
              </button>
              <span className="min-w-0 flex-1 truncate text-foreground/90">{note.body}</span>
              {note.outdated && <span className="shrink-0 text-[11px] text-warn">outdated</span>}
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {note.sentAt ? "sent" : "not sent"}
              </span>
              <button
                type="button"
                onClick={() => api.remove([note.id])}
                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {note.sentAt ? "Resolve" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
