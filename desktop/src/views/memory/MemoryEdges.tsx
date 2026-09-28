import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daemon } from "@/daemon";
import type { Memory } from "@/protocol";

import { MEMORY_RELATIONS } from "./labels";
import { useMemoryEdges } from "./queries";

const SELECT_CLASS = "h-8 rounded-md border bg-background px-2 text-[13px]";
const CANDIDATES = 5;

const preview = (memory: Memory | undefined, id: string) =>
  memory ? memory.content : `Memory ${id.slice(0, 8)} (not in the loaded list)`;

/**
 * The links touching one memory, plus a small form to add one. Linking is
 * directional: the open memory is the source.
 *
 * @param props.memory The open memory.
 * @param props.index Every known memory by id, to name the other end of a link.
 * @param props.onSelect Called with a memory id to open it.
 */
export function MemoryEdges({
  memory,
  index,
  onSelect,
}: {
  memory: Memory;
  index: Map<string, Memory>;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const edges = useMemoryEdges(memory.id);
  const [relation, setRelation] = useState<string>("related");
  const [find, setFind] = useState("");
  const [target, setTarget] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const term = find.trim().toLowerCase();
    if (!term) return [];
    return [...index.values()]
      .filter((m) => m.id !== memory.id && m.content.toLowerCase().includes(term))
      .slice(0, CANDIDATES);
  }, [find, index, memory.id]);

  const add = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await daemon.addMemoryEdge(memory.id, target.id, relation);
      await queryClient.invalidateQueries({ queryKey: ["memory", "edges"] });
      setTarget(null);
      setFind("");
    } catch (error) {
      toast.error("Could not add the link", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Links" className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium">
        <Link2 aria-hidden className="size-3.5 text-muted-foreground" />
        Links
      </h3>
      {edges.isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading links…</p>
      ) : edges.error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {edges.error instanceof Error ? edges.error.message : "Could not load links."}
        </p>
      ) : edges.data?.length ? (
        <ul className="space-y-1">
          {edges.data.map((edge) => {
            const outgoing = edge.srcId === memory.id;
            const otherId = outgoing ? edge.dstId : edge.srcId;
            return (
              <li key={`${edge.srcId}-${edge.dstId}-${edge.relation}`}>
                <button
                  type="button"
                  onClick={() => onSelect(otherId)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-secondary/60"
                >
                  <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    {outgoing ? edge.relation : `is ${edge.relation} by`}
                    <ArrowRight aria-hidden className="size-3" />
                  </span>
                  <span className="line-clamp-2 min-w-0 break-words">
                    {preview(index.get(otherId), otherId)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">Not linked to any other memory.</p>
      )}

      <div className="space-y-1.5 rounded-md border p-2">
        <div className="flex items-center gap-2">
          <select
            aria-label="Relation"
            value={relation}
            onChange={(event) => setRelation(event.target.value)}
            className={SELECT_CLASS}
          >
            {MEMORY_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Input
            aria-label="Find a memory to link"
            value={target ? target.content.slice(0, 60) : find}
            readOnly={!!target}
            onChange={(event) => setFind(event.target.value)}
            placeholder="Find a memory to link"
            className="h-8 min-w-0 flex-1 text-[13px]"
          />
          {target ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setTarget(null)}>
              Change
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={!target || busy} onClick={() => void add()}>
            Add link
          </Button>
        </div>
        {!target && candidates.length > 0 && (
          <ul className="space-y-0.5">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setTarget(candidate)}
                  className="line-clamp-1 w-full rounded px-2 py-1 text-left text-[13px] hover:bg-secondary/60"
                >
                  {candidate.content}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!target && find.trim() && candidates.length === 0 && (
          <p className="px-1 text-[12px] text-muted-foreground">No other memory matches.</p>
        )}
      </div>
    </section>
  );
}
