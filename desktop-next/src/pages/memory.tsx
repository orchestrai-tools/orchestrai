import type { Memory, MemoryProposal } from "@warpforge/protocol";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { PageToolbar } from "../components/common/page-toolbar";
import { startDream } from "../lib/dream";
import { proposalEffect } from "../lib/memory-labels";
import { useShell } from "../lib/shell-store";
import { forgetMemory, resolveProposal, useMemoryRows, useMemoryStats } from "./memory/memory-data";
import { MemoryDetail } from "./memory/memory-detail";
import { MemoryList, type MemoryFilters } from "./memory/memory-list";
import { Proposals } from "./memory/proposals";

type View = "entries" | "proposals";

const NO_FILTERS: MemoryFilters = { query: "", scope: "all", kind: "all", tag: "" };

/** What agents remember across runs, where each memory came from, and what dreaming wants to clean up. */
export function MemoryPage() {
  const project = useShell((state) => state.project);
  const [view, setView] = useState<View>("entries");
  const [filters, setFilters] = useState<MemoryFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<Memory | null>(null);
  const [approving, setApproving] = useState<MemoryProposal | null>(null);
  const { stats, statsError, proposals, proposalError, reload: reloadStats } = useMemoryStats();
  const list = useMemoryRows(filters);
  const index = useMemo(() => new Map(list.rows.map((row) => [row.id, row])), [list.rows]);
  const selected = (selectedId ? index.get(selectedId) : undefined) ?? list.rows[0];
  const pending = proposals.filter((proposal) => proposal.status === "pending").length;

  const meta = statsError
    ? statsError
    : stats
      ? `${stats.globalCount} global · ${stats.projectCount} in projects`
      : undefined;

  const resolve = async (proposal: MemoryProposal, approve: boolean) => {
    if (await resolveProposal(proposal, approve)) {
      reloadStats();
      list.reload();
    }
  };

  const open = (id: string) => {
    setSelectedId(id);
    setView("entries");
  };

  const askForget = useCallback(() => setForgetting(selected ?? null), [selected]);

  return (
    <div className="@container flex flex-col gap-5 p-4">
      <PageToolbar title="Memory" meta={meta}>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={view}
          onValueChange={(next) => next && setView(next as View)}
          aria-label="Show"
        >
          <ToggleGroupItem value="entries">Entries</ToggleGroupItem>
          <ToggleGroupItem value="proposals">
            Proposals
            {pending > 0 && (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground tabular-nums">{pending}</span>
              </>
            )}
          </ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>

      {view === "entries" ? (
        <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_22rem]">
          <MemoryList
            rows={list.rows}
            filters={filters}
            onFilters={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            searchMode={stats?.embeddingMode}
            loading={list.loading}
            error={list.error}
            hasMore={list.hasMore}
            onRetry={list.reload}
            onMore={list.more}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
          {selected && (
            <MemoryDetail
              key={`${selected.id}:${selected.updatedAt}`}
              memory={selected}
              index={index}
              onSelect={open}
              onChanged={list.reload}
              onForget={askForget}
              className="@3xl:sticky @3xl:top-4 @3xl:self-start"
            />
          )}
        </div>
      ) : (
        <Proposals
          proposals={proposals}
          index={index}
          error={proposalError}
          onRetry={reloadStats}
          onResolve={(proposal, approve) =>
            approve && proposalEffect(proposal).applies
              ? setApproving(proposal)
              : void resolve(proposal, approve)
          }
          onOpen={open}
          onDream={(dryRun) => startDream(project, dryRun)}
        />
      )}

      <ConfirmDialog
        open={forgetting !== null}
        title="Forget this memory?"
        description="Agents stop seeing it from their next search or run. This cannot be undone."
        confirmLabel="Forget"
        onOpenChange={(next) => !next && setForgetting(null)}
        onConfirm={() => {
          const target = forgetting;
          if (!target) return;
          void forgetMemory(target.id).then((done) => {
            if (!done) return;
            if (selectedId === target.id) setSelectedId(null);
            list.reload();
            reloadStats();
          });
        }}
      />
      <ConfirmDialog
        open={approving !== null}
        title="Approve this proposal?"
        description={approving ? proposalEffect(approving).summary : ""}
        confirmLabel="Approve and delete"
        onOpenChange={(next) => !next && setApproving(null)}
        onConfirm={() => approving && void resolve(approving, true)}
      />
    </div>
  );
}
