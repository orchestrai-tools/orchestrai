import { daemon } from "@warpforge/daemon";
import type { Automation, AutomationRun } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { PageToolbar } from "../components/common/page-toolbar";
import { useCreateAsk } from "../lib/create-ask";
import { useShell } from "../lib/shell-store";
import { AutomationDetail } from "./automations/automation-detail";
import { AutomationDialog } from "./automations/automation-dialog";
import { AutomationFilters } from "./automations/automation-filters";
import { AutomationList } from "./automations/automation-list";
import { DayStrip } from "./automations/day-strip";
import { RunOutputDialog } from "./automations/run-output-dialog";
import { IDLE_FILTERS, matchAutomations, useAutomations, type AutomationFilters as Filters, type Scope } from "./automations/use-automations";

const EMPTY_RUNS: AutomationRun[] = [];

/** Schedules that start tasks. The automation is the trigger; each run is a real task on the board. */
export function Automations() {
  const project = useShell((state) => state.project);
  return <ProjectAutomations key={project ?? ""} project={project} />;
}

function ProjectAutomations({ project }: { project: string | null }) {
  const openTask = useShell((state) => state.openTask);
  const [scope, setScope] = useState<Scope>(project ? "project" : "all");
  const { rows, runs, runsError, loading, error, reload, replace } = useAutomations(project ?? "", scope);
  const creating = useCreateAsk((ask) => ask.kind === "automation");
  const [filters, setFilters] = useState<Filters>(IDLE_FILTERS);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [openRun, setOpenRun] = useState<{ automation: Automation; run: AutomationRun } | null>(null);

  const runsOf = (automation: Automation) =>
    [...(runs[automation.id] ?? EMPTY_RUNS)].sort((a, b) => b.runNumber - a.runNumber);
  const visible = matchAutomations(rows, filters);
  const selected = visible.find((automation) => automation.id === selectedId) ?? visible[0];
  const on = rows.filter((automation) => automation.enabled).length;
  const narrowed = filters.search !== "" || filters.state !== "all" || filters.outcome !== "all";
  const fail = (fallback: string) => (err: unknown) => toast.error(err instanceof Error ? err.message : fallback);
  const openNew = () => useCreateAsk.getState().ask("automation");
  const closeDialog = () => {
    setEditing(null);
    useCreateAsk.getState().clear();
  };

  const toggle = (automation: Automation, enabled: boolean) =>
    void daemon
      .updateAutomation(automation.id, { enabled })
      .then((next) => {
        replace(next);
        toast.success(`${next.name} is ${enabled ? "on" : "paused"}`);
      })
      .catch(fail("Could not update it"));

  const runNow = (automation: Automation) =>
    void daemon
      .runAutomationNow(automation.id)
      .then(() => {
        toast.success(`Ran ${automation.name}`);
        void reload();
      })
      .catch(fail("Could not run it"));

  const duplicate = (automation: Automation) =>
    void daemon
      .createAutomation({
        project: automation.project,
        name: `${automation.name} (copy)`,
        prompt: automation.prompt,
        agent: automation.agent,
        model: automation.model ?? null,
        configOverrides: automation.configOverrides,
        trigger: automation.trigger,
        timezone: automation.timezone,
        precheck: automation.precheck ?? null,
        enabled: false,
        missedRunGraceMinutes: automation.missedRunGraceMinutes,
        reuseSession: automation.reuseSession,
        worktree: automation.worktree,
        worktreeBase: automation.worktreeBase ?? null,
      })
      .then(async (copy) => {
        toast.success(`Created ${copy.name}, paused so it never fires twice by accident`);
        await reload();
        setSelectedId(copy.id);
      })
      .catch(fail("Could not duplicate it"));

  const remove = (automation: Automation) =>
    void daemon
      .deleteAutomation(automation.id)
      .then(() => {
        toast.success(`Deleted ${automation.name}`);
        setSelectedId(undefined);
        void reload();
      })
      .catch(fail("Could not delete the automation"));

  return (
    <div className="@container flex flex-col gap-5 p-4">
      <PageToolbar title="Automations" meta={rows.length ? `${rows.length} · ${on} on` : undefined}>
        <AutomationFilters scope={scope} onScope={setScope} filters={filters} onChange={setFilters} />
        <Button
          size="sm"
          variant="outline"
          disabled={!project}
          title={project ? undefined : "Open a project to add an automation to it"}
          onClick={openNew}
        >
          New automation
        </Button>
      </PageToolbar>

      {error && (
        <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          {error}
          <Button size="xs" variant="outline" onClick={() => void reload()}>
            Retry
          </Button>
        </p>
      )}

      {loading && rows.length === 0 && !error ? (
        <div className="flex flex-col gap-2" aria-label="Loading automations">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-80" />
          ))}
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="text-sm text-muted-foreground">
            No automations {scope === "all" ? "in any project" : `in ${project}`}. An automation is a schedule that starts a task, so
            work like a nightly sweep happens without you.
          </p>
          {project && (
            <Button size="sm" onClick={openNew}>
              New automation
            </Button>
          )}
        </div>
      ) : (
        rows.length > 0 && (
          <>
            <DayStrip
              automations={rows}
              runsOf={runsOf}
              onSelect={(id) => {
                setFilters(IDLE_FILTERS);
                setSelectedId(id);
              }}
            />
            {visible.length === 0 && narrowed && (
              <p className="text-sm text-muted-foreground">
                No automation matches.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setFilters(IDLE_FILTERS)}
                >
                  Clear the search and filters
                </button>
              </p>
            )}
            <div className="grid gap-6 @3xl:grid-cols-[20rem_minmax(0,1fr)]">
              <AutomationList
                automations={visible}
                runsOf={runsOf}
                showProject={scope === "all"}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                onToggle={toggle}
                className="@3xl:sticky @3xl:top-4 @3xl:self-start"
              />
              {selected && (
                <AutomationDetail
                  key={selected.id}
                  automation={selected}
                  runs={runsOf(selected)}
                  runsError={runsError}
                  onRetryRuns={() => void reload()}
                  onRunNow={() => runNow(selected)}
                  onToggle={(enabled) => toggle(selected, enabled)}
                  onEdit={() => setEditing(selected)}
                  onDuplicate={() => duplicate(selected)}
                  onDelete={() => setDeleting(selected)}
                  onOpenRun={(run) => setOpenRun({ automation: selected, run })}
                  onOpenTask={(id) => openTask(id, selected.project)}
                />
              )}
            </div>
          </>
        )
      )}

      <AutomationDialog
        project={editing?.project ?? project ?? ""}
        open={editing !== null || (creating && Boolean(project))}
        editing={editing}
        onClose={closeDialog}
        onSaved={(automation, run) => {
          closeDialog();
          setSelectedId(automation.id);
          if (run) runNow(automation);
          else void reload();
        }}
      />
      <RunOutputDialog
        automationName={openRun?.automation.name ?? ""}
        run={openRun?.run ?? null}
        onOpenTask={(id) => openRun && openTask(id, openRun.automation.project)}
        onClose={() => setOpenRun(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "automation"}?`}
        description="The schedule and its run history go away. Tasks its runs created stay on the board."
        confirmLabel="Delete"
        tone="destructive"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  );
}
