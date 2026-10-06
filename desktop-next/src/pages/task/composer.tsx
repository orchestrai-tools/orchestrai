import { daemon } from "@warpforge/daemon";
import type { CommandInfo, PromptAttachment, SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { ArrowUpIcon, AtSignIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { contextImages, messageWithChips, useComposerChips } from "../../lib/composer-chips";
import { bindComposerCommands } from "../../lib/composer-commands";
import { useComposerInsert } from "../../lib/composer-insert";
import { latestContextUsage } from "../../lib/context-usage";
import { rankFiles } from "../../lib/file-rank";
import { stepMatch } from "../../lib/file-search";
import {
  FILE_REF_MIME,
  extractFileReferences,
  insertFileRef,
  replaceMention,
  splitFileReference,
} from "../../lib/mention-path";
import {
  deliverComposerMessage,
  workflowDelivery,
  workflowPlaceholder,
} from "../../lib/workflow-send";
import { AgentOptions } from "./agent-options";
import { CommandMenu, ComposerChips, MentionMenu, attachmentFromFile } from "./composer-parts";
import { ContextRing } from "./context-ring";
import type { TaskFiles } from "./use-task-files";

/**
 * The composer adds what the wrapped agent cannot do itself: project files
 * by @, attachments, and diffs or notes sent from other pages. The agent's
 * own slash commands complete from what it reported. ⌘↵ sends.
 */
export function Composer({
  task,
  agentName,
  running,
  commands,
  updates,
  files,
  insert,
}: {
  task: TaskInfo;
  agentName: string;
  running: boolean;
  commands: CommandInfo[];
  updates: SessionUpdate[];
  files: TaskFiles;
  insert?: { id: number; text: string } | null;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pathDrag, setPathDrag] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const pending = useComposerInsert((state) => state.pending);
  const placeholder = workflowPlaceholder(task) ?? `Message ${agentName}. @ a file, / a command.`;
  const blocked = workflowDelivery(task).kind === "blocked";

  const at = draft.lastIndexOf("@");
  const token = at >= 0 ? draft.slice(at + 1) : "";
  const slash =
    draft.startsWith("/") && !draft.includes(" ") && !draft.includes("\n")
      ? draft.slice(1).toLowerCase()
      : null;
  const commandMatches =
    slash === null
      ? []
      : commands.filter((command) => command.name.toLowerCase().startsWith(slash));
  const mentioning = slash === null && at >= 0 && !/[\s\n]/.test(token);
  const named = mentioning ? rankFiles(files.files, token).slice(0, 8) : [];

  useEffect(() => {
    bindComposerCommands({ attach: () => fileInput.current?.click() });
    return () => bindComposerCommands(null);
  }, []);

  useEffect(() => {
    setMenuIndex(0);
  }, [draft]);

  useEffect(() => {
    if (!insert?.text) return;
    setDraft((current) => (current.trim() ? `${current}\n\n${insert.text}` : insert.text));
  }, [insert]);

  useEffect(() => {
    if (!pending?.text) return;
    const text = pending.text;
    if (!useComposerInsert.getState().claim(pending.id)) return;
    setDraft((current) => (current.trim() ? `${current}\n\n${text}` : text));
  }, [pending]);

  function pick(path: string) {
    if (at < 0) return;
    setDraft(replaceMention(draft, at, draft.length, path).value);
  }

  function attach(file: File) {
    void attachmentFromFile(file)
      .then((next) => setAttachments((current) => [...current, next]))
      .catch(() => toast.error(`Could not read ${file.name}`));
  }

  function startMention() {
    const node = textArea.current;
    const caret = node?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const gap = before && !/\s$/.test(before) ? " " : "";
    setDraft(`${before}${gap}@${draft.slice(caret)}`);
    node?.focus();
  }

  function acceptDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    const mimePath = event.dataTransfer.getData(FILE_REF_MIME);
    const plain = event.dataTransfer.getData("text/plain");
    const ref = mimePath || (event.dataTransfer.files.length === 0 ? plain : "");
    if (ref && !ref.includes("\n")) {
      const caret = textArea.current?.selectionStart ?? draft.length;
      setDraft(insertFileRef(draft, caret, ref).value);
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) attach(file);
  }

  async function send() {
    if (sending) return;
    const text = draft.trim();
    const mentioned = extractFileReferences(draft)
      .map(splitFileReference)
      .filter((file) => files.known.has(file.path))
      .map((file) =>
        file.range
          ? { type: "file" as const, path: file.path, range: file.range }
          : { type: "file" as const, path: file.path },
      );
    const chips = useComposerChips.getState().take();
    const body = messageWithChips(text, chips.diffs, chips.contexts);
    const shots = contextImages(chips.contexts);
    if (!body && attachments.length === 0 && mentioned.length === 0 && shots.length === 0) {
      useComposerChips.setState(chips);
      return;
    }
    setSending(true);
    try {
      await deliverComposerMessage(task, task.id, body, [...mentioned, ...attachments, ...shots]);
      setDraft("");
      setAttachments([]);
    } catch (error) {
      useComposerChips.setState(chips);
      toast.error(error instanceof Error ? error.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const meta = event.metaKey || event.ctrlKey;
    if (
      meta &&
      event.shiftKey &&
      (event.key === "a" || event.key === "A" || event.key === "i" || event.key === "I")
    ) {
      event.preventDefault();
      fileInput.current?.click();
      return;
    }
    if (named.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setMenuIndex((index) => stepMatch(index, named.length, event.key === "ArrowDown" ? 1 : -1));
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !meta)) {
        event.preventDefault();
        pick(named[menuIndex]?.path ?? named[0].path);
        return;
      }
    }
    if (commandMatches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : commandMatches.length - 1;
        setMenuIndex((index) => (index + step) % commandMatches.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !meta)) {
        event.preventDefault();
        setDraft(`/${(commandMatches[menuIndex] ?? commandMatches[0]).name} `);
        return;
      }
    }
    if (event.key === "Enter" && meta) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      className="relative"
      onDragEnter={(event) => {
        event.preventDefault();
        const types = [...(event.dataTransfer?.types ?? [])];
        setPathDrag(types.includes(FILE_REF_MIME) || types.includes("text/plain"));
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setDragging(false);
      }}
      onDrop={acceptDrop}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {commandMatches.length > 0 && (
        <CommandMenu
          commands={commandMatches}
          active={menuIndex}
          onPick={(command) => setDraft(`/${command.name} `)}
        />
      )}
      {mentioning && commandMatches.length === 0 && (
        <MentionMenu
          files={named}
          active={menuIndex}
          loading={files.loading}
          error={files.error}
          onPick={pick}
        />
      )}
      <div
        className={cn(
          "rounded-md border bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring/40",
          dragging && "border-dashed border-ring",
        )}
      >
        {dragging && (
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            {pathDrag ? "Drop to attach the file as context" : "Drop files to attach"}
          </p>
        )}
        <ComposerChips
          attachments={attachments}
          onRemoveAttachment={(index) =>
            setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
          }
        />
        <Textarea
          ref={textArea}
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label={`Message ${agentName}`}
          disabled={blocked}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-60 min-h-0 resize-none rounded-none border-0 bg-transparent px-3 pt-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Mention a file"
            disabled={blocked}
            onClick={startMention}
          >
            <AtSignIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Attach a file"
            disabled={blocked}
            onClick={() => fileInput.current?.click()}
          >
            <PaperclipIcon />
          </Button>
          <input
            ref={fileInput}
            type="file"
            aria-label="Attach a file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) attach(file);
              event.target.value = "";
            }}
          />
          <span className="ml-1 flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground">
            <span className="truncate px-1">{agentName}</span>
            <AgentOptions taskId={task.id} options={task.configOptions ?? []} />
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ContextRing usage={latestContextUsage(updates)} />
            <Kbd>⌘↵</Kbd>
            {running && (
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label="Stop the agent"
                onClick={() =>
                  void daemon
                    .request("task.cancel", { task_id: task.id })
                    .catch((err: unknown) =>
                      toast.error(err instanceof Error ? err.message : "Could not stop the agent"),
                    )
                }
              >
                <SquareIcon />
              </Button>
            )}
            <Button
              type="submit"
              size="icon-xs"
              aria-label="Send"
              disabled={running || blocked || sending}
            >
              <ArrowUpIcon />
            </Button>
          </span>
        </div>
      </div>
    </form>
  );
}
