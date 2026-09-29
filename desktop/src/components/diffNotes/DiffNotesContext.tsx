import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { daemon } from "@/daemon";
import { useWorkflowSend } from "@/hooks/useWorkflowSend";
import { formatDiffNotesPrompt, type DiffNote, type NoteAnchor } from "@/lib/diffNotes";
import { generateId } from "@/lib/id";
import type { TaskInfo } from "@/protocol";
import { useDiffNotesStore } from "@/store/diffNotes";

/** The note being written or edited. One at a time across the whole diff. */
export interface NoteDraft {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string[];
  body: string;
  /** Set when editing an existing note rather than writing a new one. */
  noteId?: string;
}

export interface DiffNotesApi {
  notes: readonly DiffNote[];
  draft: NoteDraft | null;
  startDraft: (draft: Omit<NoteDraft, "body" | "noteId">) => void;
  editNote: (id: string) => void;
  setDraftBody: (body: string) => void;
  cancelDraft: () => void;
  saveDraft: () => void;
  remove: (ids: readonly string[]) => void;
  /** Turn a sent note back into a draft so the next batch carries it. */
  resend: (id: string) => void;
  reanchor: (anchors: ReadonlyMap<string, NoteAnchor>) => void;
  /** Notes the send button would deliver: drafts, or else every sent note. */
  batch: readonly DiffNote[];
  send: () => Promise<void>;
  sending: boolean;
  error: string | null;
  /** Why sending is not possible right now, or null when it is. */
  blocked: string | null;
  /** The agent is mid-turn, so a send waits in its queue. */
  busy: boolean;
  /** For a finished pipeline, the stage the notes go to; null for this task's own agent. */
  recipient: string | null;
}

const DiffNotesContext = createContext<DiffNotesApi | null>(null);
const EMPTY: DiffNote[] = [];

/**
 * The review notes of the task diff, or null outside a task's diff surface.
 * @returns The notes API.
 */
export function useDiffNotes(): DiffNotesApi | null {
  return useContext(DiffNotesContext);
}

/**
 * Holds a task's review notes and delivers them to its agent as one prompt.
 * @param task The task whose diff the notes are on.
 * @param children The diff surface.
 * @returns The provider.
 */
export function DiffNotesProvider({ task, children }: { task: TaskInfo; children: ReactNode }) {
  const notes = useDiffNotesStore((state) => state.byTask[task.id] ?? EMPTY);
  const add = useDiffNotesStore((state) => state.add);
  const update = useDiffNotesStore((state) => state.update);
  const removeNotes = useDiffNotesStore((state) => state.remove);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { handoff, send: sendToWorkflow, undeliverable } = useWorkflowSend(task);
  const api = useMemo<DiffNotesApi>(() => {
    const drafts = notes.filter((note) => !note.sentAt);
    const batch = drafts.length > 0 ? drafts : notes;
    const blocked = task.status === "done" ? "This task is finished" : undeliverable;

    const saveDraft = () => {
      if (!draft) return;
      const body = draft.body.trim();
      if (!body) return;
      if (draft.noteId) {
        update(task.id, new Map([[draft.noteId, { body }]]));
      } else {
        add(task.id, {
          body,
          createdAt: Date.now(),
          endLine: draft.endLine,
          id: generateId("note_"),
          path: draft.path,
          snippet: draft.snippet,
          startLine: draft.startLine,
        });
      }
      setDraft(null);
    };

    const send = async () => {
      if (sending || blocked || batch.length === 0) return;
      const text = formatDiffNotesPrompt(batch);
      setSending(true);
      setError(null);
      try {
        const submission = { attachments: [], text };
        // A busy agent queues the prompt itself (ADR 0011); nothing waits here.
        if (!(await sendToWorkflow(submission))) {
          await daemon.request("session.prompt", { task_id: task.id, ...submission });
        }
        const sentAt = Date.now();
        update(task.id, new Map(batch.map((note) => [note.id, { sentAt }])));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    };

    return {
      batch,
      blocked,
      busy: task.status === "running" || task.status === "queued",
      cancelDraft: () => setDraft(null),
      draft,
      editNote: (id) => {
        const note = notes.find((candidate) => candidate.id === id);
        if (!note) return;
        const { body, endLine, path, snippet, startLine } = note;
        setDraft({ body, endLine, noteId: id, path, snippet, startLine });
      },
      error,
      notes,
      reanchor: (anchors) => update(task.id, anchors),
      recipient: handoff ? `${handoff.label} (${handoff.agent})` : null,
      remove: (ids) => {
        removeNotes(task.id, ids);
        if (draft?.noteId && ids.includes(draft.noteId)) setDraft(null);
      },
      resend: (id) => update(task.id, new Map([[id, { sentAt: undefined }]])),
      saveDraft,
      send,
      sending,
      setDraftBody: (body) => setDraft((current) => (current ? { ...current, body } : current)),
      startDraft: (next) => setDraft({ ...next, body: "" }),
    };
  }, [
    add,
    draft,
    error,
    notes,
    removeNotes,
    sendToWorkflow,
    sending,
    task.id,
    handoff,
    task.status,
    undeliverable,
    update,
  ]);

  return <DiffNotesContext.Provider value={api}>{children}</DiffNotesContext.Provider>;
}
