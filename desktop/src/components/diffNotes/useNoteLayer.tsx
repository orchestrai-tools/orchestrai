import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { anchorNote, splitLines, type DiffNote, type NoteAnchor } from "@/lib/diffNotes";

import { useDiffNotes, type DiffNotesApi } from "./DiffNotesContext";
import { NoteCard, NoteComposer } from "./NoteCard";
import { createNoteLayer, type NoteSlot } from "./noteLayer";

const DRAFT_SLOT = "draft";
const NO_EXTENSION: Extension = [];

export interface EditorNotes {
  /** Include when creating the editor; empty outside a task diff. */
  extension: Extension;
  /** Call with the editor once created, and with null when it is destroyed. */
  attach: (view: EditorView | null) => void;
  /** Render next to the editor: the notes and composer, portalled into it. */
  portals: ReactNode;
}

/**
 * Review notes for one file's diff editor: the "+" gutter, the notes under
 * their lines, re-anchored on the snippet whenever the file text changes.
 * @param path The file's path.
 * @param text The working-tree text the editor shows.
 * @returns Handles for the editor and the portals to render.
 */
export function useNoteLayer(path: string, text: string): EditorNotes {
  const api = useDiffNotes();
  const lines = useMemo(() => splitLines(text), [text]);
  const [containers, setContainers] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  const latest = useRef({ api, lines, path });
  useEffect(() => {
    latest.current = { api, lines, path };
  });

  const [layer] = useState(() =>
    createNoteLayer({
      mount: (id, dom) => setContainers((prev) => new Map(prev).set(id, dom)),
      pick: ({ start, end }) => {
        const current = latest.current;
        current.api?.startDraft({
          endLine: end,
          path: current.path,
          snippet: current.lines.slice(start - 1, end),
          startLine: start,
        });
      },
      unmount: (id, dom) =>
        setContainers((prev) => {
          if (prev.get(id) !== dom) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }),
    }),
  );

  const notes = api?.notes;
  const anchored = useMemo(
    () =>
      (notes ?? [])
        .filter((note) => note.path === path)
        .map((note) => ({ anchor: anchorNote(note, lines), note })),
    [lines, notes, path],
  );

  useEffect(() => {
    const moved = new Map<string, NoteAnchor>();
    for (const { anchor, note } of anchored) {
      if (
        anchor.startLine !== note.startLine ||
        anchor.endLine !== note.endLine ||
        anchor.outdated !== !!note.outdated
      ) {
        moved.set(note.id, anchor);
      }
    }
    if (moved.size > 0) latest.current.api?.reanchor(moved);
  }, [anchored]);

  const draft = api?.draft?.path === path ? api.draft : null;
  const newDraftLine = draft && !draft.noteId ? draft.endLine : null;
  const slots = useMemo(() => {
    const next: NoteSlot[] = anchored.map(({ anchor, note }) => ({
      id: note.id,
      line: anchor.endLine,
    }));
    if (newDraftLine !== null) next.push({ id: DRAFT_SLOT, line: newDraftLine });
    return next;
  }, [anchored, newDraftLine]);
  const rangeStart = draft?.startLine ?? null;
  const rangeEnd = draft?.endLine ?? null;

  useEffect(() => {
    layer.sync(
      slots,
      rangeStart !== null && rangeEnd !== null ? { end: rangeEnd, start: rangeStart } : null,
    );
  }, [layer, rangeEnd, rangeStart, slots]);

  if (!api) return { attach: () => {}, extension: NO_EXTENSION, portals: null };

  const portals = [...containers].map(([id, dom]) => {
    const content =
      id === DRAFT_SLOT ? (
        draft && !draft.noteId ? (
          <Composer api={api} />
        ) : null
      ) : (
        <SlotNote api={api} entry={anchored.find(({ note }) => note.id === id)} />
      );
    return content ? createPortal(content, dom, id) : null;
  });

  return { attach: layer.attach, extension: layer.extension, portals };
}

function Composer({ api }: { api: DiffNotesApi }) {
  if (!api.draft) return null;
  return (
    <NoteComposer
      draft={api.draft}
      onCancel={api.cancelDraft}
      onChange={api.setDraftBody}
      onSave={api.saveDraft}
    />
  );
}

function SlotNote({
  api,
  entry,
}: {
  api: DiffNotesApi;
  entry: { note: DiffNote; anchor: NoteAnchor } | undefined;
}) {
  if (!entry) return null;
  const { note, anchor } = entry;
  if (api.draft?.noteId === note.id) return <Composer api={api} />;
  return (
    <NoteCard
      note={{ ...note, endLine: anchor.endLine, startLine: anchor.startLine }}
      outdated={anchor.outdated}
      onEdit={() => api.editNote(note.id)}
      onRemove={() => api.remove([note.id])}
      onResend={() => api.resend(note.id)}
    />
  );
}
