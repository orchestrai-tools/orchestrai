import { daemon } from "@warpforge/daemon";
import type { Memory, MemoryEdge } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { MoreHorizontalIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SelectMenu } from "../../components/common/select-menu";
import { MEMORY_RELATIONS, scopeLabel } from "../../lib/memory-labels";
import { useMemoryActions } from "../../lib/memory-palette";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { InlineText, kindLabel, when } from "./inline-text";

const INVERSE: Record<string, string> = {
  related: "related to",
  supports: "supported by",
  contradicts: "contradicted by",
  supersedes: "superseded by",
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function useEdges(id: string, version: number) {
  const [edges, setEdges] = useState<MemoryEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    void daemon
      .memoryEdges(id)
      .then((next) => {
        if (!Array.isArray(next)) throw new Error("Could not load links");
        setEdges(next);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load links"),
      );
  }, [id, version, reload]);
  return { edges, error, retry: () => setReload((count) => count + 1) };
}

/** One memory: its text, where it came from, and the links that touch it. */
export function MemoryDetail({
  memory,
  index,
  onSelect,
  onChanged,
  onForget,
  className,
}: {
  memory: Memory;
  index: Map<string, Memory>;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onForget: () => void;
  className?: string;
}) {
  const project = useShell((state) => state.project);
  const tasks = useDaemon().snapshot.tasks;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [linking, setLinking] = useState(false);
  const [relation, setRelation] = useState("related");
  const [target, setTarget] = useState("");
  const { edges, error: edgeError, retry } = useEdges(memory.id, memory.updatedAt);
  const task = memory.createdBy ? tasks.find((item) => item.id === memory.createdBy) : undefined;
  const dirty = draft.trim() !== "" && draft !== memory.content;

  async function save() {
    try {
      await daemon.updateMemory(memory.id, draft.trim());
      toast.success("Saved the memory");
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the memory");
    }
  }

  async function link() {
    if (!target) return;
    try {
      await daemon.addMemoryEdge(memory.id, target, relation);
      setLinking(false);
      setTarget("");
      retry();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the link");
    }
  }

  const paletteActions = useMemo(
    () => ({
      save: () => (dirty ? void save() : toast.error("Nothing to save")),
      askDelete: onForget,
    }),
    [dirty, draft, memory.id, onForget],
  );
  useMemoryActions(paletteActions);

  const links = edges.map((edge) => {
    const outgoing = edge.srcId === memory.id;
    const other = outgoing ? edge.dstId : edge.srcId;
    return {
      id: other,
      label: outgoing ? edge.relation : (INVERSE[edge.relation] ?? edge.relation),
      entry: index.get(other),
    };
  });
  const others = [...index.values()].filter(
    (other) => other.id !== memory.id && !links.some((item) => item.id === other.id),
  );
  const superseded = memory.supersededBy ? index.get(memory.supersededBy) : undefined;
  const openTask = () =>
    project && memory.createdBy && useShell.getState().openTask(memory.createdBy, project);

  return (
    <article aria-label="Memory entry" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{kindLabel(memory.kind)}</span> ·{" "}
          {scopeLabel(memory)}
        </p>
        <Button size="sm" variant="outline" disabled={editing} onClick={() => setEditing(true)}>
          Edit
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More actions for this memory">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(memory.content)}>
              Copy text
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(memory.id)}>
              Copy id
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLinking(true)}>
              Link to another memory…
            </DropdownMenuItem>
            {memory.createdBy && project && (
              <DropdownMenuItem onSelect={openTask}>Open the task that wrote it</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onForget}>
              Forget…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Memory text"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-28 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(memory.content);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">
              Agents see the new text from their next search or run.
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          <InlineText text={memory.content} />
        </p>
      )}

      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {memory.createdBy && (
          <Fact label="Source">
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={openTask}
            >
              {task ? task.title || task.prompt : memory.createdBy}
            </button>
          </Fact>
        )}
        <Fact label="Written">{when(memory.createdAt)}</Fact>
        {memory.updatedAt !== memory.createdAt && (
          <Fact label="Edited">{when(memory.updatedAt)}</Fact>
        )}
        <Fact label="Last used">{when(memory.lastAccessed)}</Fact>
        {memory.supersededBy && (
          <Fact label="Superseded by">
            <button
              type="button"
              onClick={() => onSelect(memory.supersededBy!)}
              className="line-clamp-2 text-left hover:underline"
            >
              {superseded ? <InlineText text={superseded.content} /> : memory.supersededBy}
            </button>
          </Fact>
        )}
        {memory.tags.length > 0 && (
          <Fact label="Tags">{memory.tags.map((tag) => `#${tag}`).join("  ")}</Fact>
        )}
        {links.map((item, position) => (
          <Fact key={`${item.id}-${item.label}`} label={position === 0 ? "Links" : ""}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="line-clamp-2 text-left hover:underline"
            >
              <span className="text-muted-foreground">{item.label} </span>
              {item.entry ? (
                <InlineText text={item.entry.content} />
              ) : (
                <span className="font-mono">{item.id}</span>
              )}
            </button>
          </Fact>
        ))}
        {edgeError && (
          <Fact label="Links">
            <span className="text-red-600 dark:text-red-400">
              {edgeError}{" "}
              <button type="button" className="underline underline-offset-2" onClick={retry}>
                Retry
              </button>
            </span>
          </Fact>
        )}
      </dl>

      {linking && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            This memory is the source; the link reads the other way from the other end.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu
              label="Relation"
              value={relation}
              className="h-7"
              options={MEMORY_RELATIONS.map((value) => ({ value, label: value }))}
              onChange={setRelation}
            />
            <SelectMenu
              label="Memory"
              value={target}
              className="h-7 max-w-56"
              options={[
                { value: "", label: "Choose a memory" },
                ...others.map((other) => ({
                  value: other.id,
                  label: other.content.replaceAll("`", "").slice(0, 56),
                })),
              ]}
              onChange={setTarget}
            />
            <Button size="sm" disabled={!target} onClick={() => void link()}>
              Link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
