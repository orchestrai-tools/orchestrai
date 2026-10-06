import type { Hunk } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { PlusIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { anchorNote, type DiffNote } from "../../lib/diff-notes";
import { hunkKey } from "../../lib/diff-session";
import { diffLines, gapBefore, hunkHeader, pairLines, type DiffLine } from "./diff-lines";
import type { ChangedFile } from "./tree";
import type { DiffMode } from "./use-changes";

interface Props {
  file: ChangedFile;
  mode: DiffMode;
  notes: DiffNote[];
  onNote: (hunkIndex: number, lineIndex: number, body: string) => Promise<boolean>;
  onAccept: (hunkIndex: number) => void;
  onReject: (hunkIndex: number) => void;
}

const TINT = { add: "bg-emerald-500/10", del: "bg-red-500/10", context: "" } as const;
const MARK = { add: "+", del: "−", context: "" } as const;
const MARK_TONE = {
  add: "text-emerald-600 dark:text-emerald-400",
  del: "text-red-600 dark:text-red-400",
  context: "",
} as const;
const NUMBER = "select-none pr-2 text-right text-muted-foreground/70 tabular-nums";
const CODE = "min-w-0 pr-4 whitespace-pre-wrap [overflow-wrap:anywhere]";

/** Each note sits under the line it quotes, in the first hunk where its quote still matches. */
function placeNotes(hunks: Hunk[], notes: DiffNote[]) {
  const placed = new Set<string>();
  return hunks.map((hunk) => {
    const at = new Map<number, DiffNote[]>();
    for (const note of notes) {
      if (placed.has(note.id)) continue;
      const anchor = anchorNote(note, hunk.lines);
      if (anchor.outdated) continue;
      placed.add(note.id);
      const line = anchor.endLine - 1;
      at.set(line, [...(at.get(line) ?? []), note]);
    }
    return at;
  });
}

/**
 * One file's hunks, unified or side by side, with unchanged stretches folded.
 * Hover a line to leave a note on it; the note goes to the task's agent.
 */
export function DiffView({ file, mode, notes, onNote, onAccept, onReject }: Props) {
  const [composing, setComposing] = useState<string>();
  const hunks = file.diff.hunks;
  const placed = placeNotes(hunks, notes);

  const extras = (hunkIndex: number, line: DiffLine): ReactNode => {
    const key = `${hunkIndex}:${line.index}`;
    const here = placed[hunkIndex]?.get(line.index) ?? [];
    if (!here.length && composing !== key) return null;
    return (
      <div
        className={cn(
          "flex flex-col gap-1.5 py-1.5 pr-4 font-sans",
          mode === "unified" ? "pl-[7.25rem]" : "pl-12",
        )}
      >
        {here.map((note) => (
          <div
            key={note.id}
            className="flex flex-col gap-1 rounded-md border bg-background p-2"
          >
            <p className="text-sm whitespace-pre-wrap">{note.body}</p>
            <span className="text-xs text-muted-foreground">Sent to the agent</span>
          </div>
        ))}
        {composing === key && (
          <NoteComposer
            onCancel={() => setComposing(undefined)}
            onSave={async (body) => {
              if (await onNote(hunkIndex, line.index, body)) setComposing(undefined);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="font-mono text-xs leading-5 [tab-size:4]">
      {hunks.map((hunk, index) => {
        const gap = gapBefore(hunks, index);
        const lines = diffLines(hunk);
        const note = (line: DiffLine) => setComposing(`${index}:${line.index}`);
        return (
          <section
            key={hunkKey(hunk)}
            aria-label={hunkHeader(hunk)}
            data-file={file.path}
            data-hunk-key={hunkKey(hunk)}
          >
            {gap > 0 && (
              <Fold>
                {gap} unchanged {gap === 1 ? "line" : "lines"}
              </Fold>
            )}
            <HunkBar
              hunk={hunk}
              onAccept={() => onAccept(index)}
              onReject={() => onReject(index)}
            />
            {mode === "unified"
              ? lines.map((line) => (
                  <Fragment key={line.index}>
                    <UnifiedLine line={line} onNote={() => note(line)} />
                    {extras(index, line)}
                  </Fragment>
                ))
              : pairLines(lines).map((pair, row) => (
                  <Fragment key={row}>
                    <div className="grid grid-cols-2">
                      <SplitSide line={pair.left} side="old" onNote={note} />
                      <SplitSide line={pair.right} side="new" onNote={note} />
                    </div>
                    {pair.left?.kind === "del" && extras(index, pair.left)}
                    {pair.right && extras(index, pair.right)}
                  </Fragment>
                ))}
          </section>
        );
      })}
      {hunks.length === 0 && (
        <Fold>No text changes to show; the file may be binary or only its mode changed.</Fold>
      )}
    </div>
  );
}

function Fold({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 px-3 py-0.5 font-sans text-muted-foreground">⋯ {children}</div>
  );
}

function HunkBar({
  hunk,
  onAccept,
  onReject,
}: {
  hunk: Hunk;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="group/hunk flex items-center gap-2 bg-muted/70 px-3 text-muted-foreground">
      <span className="truncate">{hunkHeader(hunk)}</span>
      {hunk.resolution && (
        <span className="font-sans text-foreground/70">
          {hunk.resolution === "accept" ? "Accepted" : "Rejected"}
        </span>
      )}
      <div className="ml-auto flex items-center font-sans opacity-0 group-hover/hunk:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="xs" onClick={onAccept} title="Keep these lines">
          Accept
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onReject}
          title="Put these lines back to the last commit"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function NoteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Add a note on this line"
      onClick={onClick}
      className="absolute top-0.5 left-0.5 flex size-4 items-center justify-center rounded-sm border bg-background text-foreground opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100"
    >
      <PlusIcon className="size-3" />
    </button>
  );
}

function UnifiedLine({ line, onNote }: { line: DiffLine; onNote: () => void }) {
  return (
    <div
      className={cn(
        "group/line relative grid grid-cols-[3rem_3rem_1.25rem_minmax(0,1fr)]",
        TINT[line.kind],
      )}
    >
      <NoteButton onClick={onNote} />
      <span className={NUMBER}>{line.oldNo ?? ""}</span>
      <span className={NUMBER}>{line.newNo ?? ""}</span>
      <span className={cn("text-center select-none", MARK_TONE[line.kind])}>{MARK[line.kind]}</span>
      <span className={CODE}>{line.text || " "}</span>
    </div>
  );
}

function SplitSide({
  line,
  side,
  onNote,
}: {
  line?: DiffLine;
  side: "old" | "new";
  onNote: (line: DiffLine) => void;
}) {
  const edge = side === "old" && "border-r";
  if (!line) return <span aria-hidden className={cn("bg-muted/30", edge)} />;
  const notable = side === "new" || line.kind === "del";
  return (
    <div
      className={cn(
        "group/line relative grid grid-cols-[3rem_minmax(0,1fr)]",
        TINT[line.kind],
        edge,
      )}
    >
      {notable && <NoteButton onClick={() => onNote(line)} />}
      <span className={NUMBER}>{side === "old" ? line.oldNo : line.newNo}</span>
      <span className={CODE}>
        <span className={cn("inline-block w-4 select-none", MARK_TONE[line.kind])}>
          {MARK[line.kind]}
        </span>
        {line.text || " "}
      </span>
    </div>
  );
}

function NoteComposer({
  onSave,
  onCancel,
}: {
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    await onSave(text);
    setBusy(false);
  };
  return (
    <form
      className="flex flex-col gap-1.5 rounded-md border bg-background p-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
        placeholder="What should the agent change here? ⌘↵ to send"
        aria-label="Diff note"
        className="min-h-14 text-sm"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={!body.trim() || busy}>
          Send note
        </Button>
      </div>
    </form>
  );
}
