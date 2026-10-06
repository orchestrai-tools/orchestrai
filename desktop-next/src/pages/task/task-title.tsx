import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isChat } from "../../model/chat";

const MAX_TITLE_LENGTH = 80;

export function generatedTitle(text: string): string {
  return (
    text
      .replace(/^```(?:text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .split(/\r?\n/, 1)[0]
      ?.trim()
      .slice(0, MAX_TITLE_LENGTH) ?? ""
  );
}

function labelOf(task: TaskInfo): string {
  return task.title.trim() || task.prompt || (isChat(task) ? "New chat" : "");
}

function modelOf(task: TaskInfo): string | undefined {
  const option = task.configOptions?.find((item) =>
    `${item.category ?? ""} ${item.id} ${item.name}`.toLowerCase().includes("model"),
  );
  return option?.currentValue || undefined;
}

/** The task's title. Double-click or Enter edits it; the spark has the agent name it from the conversation. */
export function TaskTitle({ task }: { task: TaskInfo }) {
  const label = labelOf(task);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function edit() {
    setDraft(label);
    setEditing(true);
  }

  async function save() {
    setEditing(false);
    const next = draft.trim().slice(0, MAX_TITLE_LENGTH);
    if (next === label.trim()) return;
    try {
      await daemon.setTaskTitle(task.id, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the title");
    }
  }

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    try {
      const text = await daemon.generateText(task.id, task.agent, "task_title", modelOf(task));
      const next = generatedTitle(text);
      if (!next) throw new Error("The agent returned an empty title");
      await daemon.setTaskTitle(task.id, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not regenerate the title");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Input
        ref={input}
        aria-label="Task title"
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className="h-8 text-base font-semibold"
      />
    );
  }

  return (
    <div className="group/title flex min-w-0 items-start gap-1">
      <h1
        tabIndex={0}
        aria-label={`Edit task title: ${label}`}
        title="Double-click to edit the title"
        onDoubleClick={edit}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            edit();
          }
        }}
        className="min-w-0 cursor-text rounded-sm text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {busy ? "Naming…" : label}
      </h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Regenerate task title"
            disabled={busy}
            onClick={() => void regenerate()}
            className="shrink-0 text-muted-foreground opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100"
          >
            {busy ? <LoaderCircleIcon className="animate-spin" /> : <SparklesIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Name it from the conversation</TooltipContent>
      </Tooltip>
    </div>
  );
}
