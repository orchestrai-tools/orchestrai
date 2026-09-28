import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { relativeTime } from "@/components/backlog/BacklogRow";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { daemon } from "@/daemon";
import type { Memory, TaskInfo } from "@/protocol";

import { scopeLabel } from "./labels";
import { MemoryEdges } from "./MemoryEdges";

const when = (secs: number) => relativeTime(secs * 1000);

/**
 * The open memory: editable content, where it came from, its links and a delete
 * action. Mount it with a key of `id` and `updatedAt` so the draft resets when
 * the stored text changes underneath it.
 *
 * @param props.memory The memory to show.
 * @param props.index Every known memory by id.
 * @param props.tasks Tasks, to name the one that wrote the memory.
 * @param props.onSelect Called with a memory id to open it.
 * @param props.onDeleted Called after the memory was deleted.
 * @param props.onOpenTask Called with a task id to open that task.
 */
export function MemoryDetail({
  memory,
  index,
  tasks,
  onSelect,
  onDeleted,
  onOpenTask,
}: {
  memory: Memory;
  index: Map<string, Memory>;
  tasks: TaskInfo[];
  onSelect: (id: string) => void;
  onDeleted: () => void;
  onOpenTask: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(memory.content);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dirty = draft !== memory.content;
  const writer = memory.createdBy ? tasks.find((task) => task.id === memory.createdBy) : undefined;

  const save = async () => {
    setSaving(true);
    try {
      await daemon.updateMemory(memory.id, draft);
      await queryClient.invalidateQueries({ queryKey: ["memory"] });
      toast.success("Memory saved");
    } catch (error) {
      toast.error("Could not save the memory", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await daemon.deleteMemory(memory.id);
    setConfirming(false);
    await queryClient.invalidateQueries({ queryKey: ["memory"] });
    onDeleted();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{memory.kind}</Badge>
        <Badge variant="outline">{scopeLabel(memory)}</Badge>
        {memory.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            #{tag}
          </Badge>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto gap-1 text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>

      <div className="space-y-2">
        <Textarea
          aria-label="Memory content"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={8}
          className="min-h-32 resize-y text-[13px] leading-relaxed"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || !draft.trim() || saving}
            onClick={() => void save()}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!dirty}
            onClick={() => setDraft(memory.content)}
          >
            Revert
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <dt>Created</dt>
        <dd>{when(memory.createdAt)}</dd>
        <dt>Edited</dt>
        <dd>{when(memory.updatedAt)}</dd>
        <dt>Last used</dt>
        <dd>{when(memory.lastAccessed)}</dd>
        {memory.createdBy ? (
          <>
            <dt>Written by</dt>
            <dd>
              {writer ? (
                <button
                  type="button"
                  className="text-foreground underline-offset-2 hover:underline"
                  onClick={() => onOpenTask(writer.id)}
                >
                  {writer.title || writer.id}
                </button>
              ) : (
                memory.createdBy
              )}
            </dd>
          </>
        ) : null}
        {memory.supersededBy ? (
          <>
            <dt>Superseded by</dt>
            <dd>
              <button
                type="button"
                className="text-foreground underline-offset-2 hover:underline"
                onClick={() => onSelect(memory.supersededBy!)}
              >
                {index.get(memory.supersededBy)?.content.slice(0, 80) ?? memory.supersededBy}
              </button>
            </dd>
          </>
        ) : null}
      </dl>

      <MemoryEdges memory={memory} index={index} onSelect={onSelect} />

      <ConfirmDialog
        open={confirming}
        title="Delete this memory?"
        description="Agents will no longer see it, and its links are removed. This cannot be undone."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  );
}
