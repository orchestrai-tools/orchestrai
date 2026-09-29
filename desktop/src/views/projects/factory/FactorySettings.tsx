import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { daemon } from "@/daemon";
import { runnerStatusKey } from "@/hooks/useRunner";
import { agentDisplayName } from "@/lib/agentNames";
import type { AgentConfig, RunnerSettings } from "@/protocol";

import { modelOptionOf } from "../../automations/labels";

interface FactorySettingsProps {
  open: boolean;
  settings: RunnerSettings;
  agents: AgentConfig[];
  onClose: () => void;
}

const FIELD =
  "bg-deep-surface h-8 w-full rounded-md border px-2 text-[13px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

const LIMITS: {
  key: keyof RunnerSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  { hint: "Items running at once.", key: "maxConcurrent", label: "Runs at once", max: 8, min: 1 },
  {
    hint: "New items wait while this many draft PRs are open.",
    key: "maxOpenPrs",
    label: "Open draft PRs",
    max: 50,
    min: 1,
  },
  {
    hint: "Items started in any 24 hours.",
    key: "maxPerDay",
    label: "Items per day",
    max: 200,
    min: 1,
  },
  {
    hint: "New items wait while an agent's quota window is above this.",
    key: "headroomPct",
    label: "Quota headroom (%)",
    max: 100,
    min: 1,
  },
  {
    hint: "New items wait below this much free disk. 0 turns it off.",
    key: "minFreeGb",
    label: "Free disk floor (GB)",
    max: 10000,
    min: 0,
  },
];

/**
 * The project's Factory settings: which workflow and agents items run on, and
 * the limits that keep unattended work bounded.
 *
 * @param props.open Whether the dialog shows.
 * @param props.settings The settings as stored.
 * @param props.agents Every configured agent.
 * @param props.onClose Closes the dialog.
 */
export function FactorySettings({ open, settings, agents, onClose }: FactorySettingsProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [seen, setSeen] = useState(open);
  if (open !== seen) {
    setSeen(open);
    if (open) setDraft(settings);
  }
  const workflows = useQuery({
    enabled: open,
    queryFn: () => daemon.workflowList(settings.project),
    queryKey: ["workflows", settings.project],
  });
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const modelOption = draft.agent ? modelOptionOf(agents, draft.agent) : null;

  const save = async () => {
    setSaving(true);
    try {
      const status = await daemon.runnerUpdateSettings(settings.project, {
        agent: draft.agent,
        headroomPct: draft.headroomPct,
        maxConcurrent: draft.maxConcurrent,
        maxOpenPrs: draft.maxOpenPrs,
        maxPerDay: draft.maxPerDay,
        minFreeGb: draft.minFreeGb,
        model: draft.model ?? "",
        workflow: draft.workflow,
      });
      queryClient.setQueryData(runnerStatusKey(settings.project), status);
      onClose();
    } catch (error) {
      toast.error("Could not save the Factory settings", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Factory settings</DialogTitle>
          <DialogDescription>
            Every queued item runs through this workflow in its own worktree. Stages the workflow
            does not pin to an agent run on the lead agent.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Workflow</span>
            <select
              aria-label="Workflow"
              value={draft.workflow}
              onChange={(event) => setDraft({ ...draft, workflow: event.target.value })}
              className={FIELD}
            >
              {!(workflows.data ?? []).some((w) => w.id === draft.workflow) && (
                <option value={draft.workflow}>{draft.workflow}</option>
              )}
              {(workflows.data ?? []).map((workflow) => (
                <option key={workflow.id} value={workflow.id} disabled={!workflow.valid}>
                  {workflow.name}
                  {workflow.stages?.length ? ` — ${workflow.stages.join(" → ")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Lead agent</span>
            <select
              aria-label="Lead agent"
              value={draft.agent}
              onChange={(event) => setDraft({ ...draft, agent: event.target.value, model: null })}
              className={FIELD}
            >
              <option value="">First enabled agent</option>
              {enabledAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agentDisplayName(agent.id, agent.displayName)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Model</span>
            <select
              aria-label="Model"
              value={draft.model ?? ""}
              disabled={!modelOption}
              onChange={(event) => setDraft({ ...draft, model: event.target.value || null })}
              className={FIELD}
            >
              <option value="">Agent default</option>
              {modelOption?.options.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
          {LIMITS.map((limit) => (
            <label key={limit.key} className="flex flex-col gap-1" title={limit.hint}>
              <span className="text-[11px] font-medium text-muted-foreground">{limit.label}</span>
              <input
                type="number"
                aria-label={limit.label}
                min={limit.min}
                max={limit.max}
                value={draft[limit.key] as number}
                onChange={(event) =>
                  setDraft({ ...draft, [limit.key]: Number(event.target.value) || limit.min })
                }
                className={FIELD}
              />
              <span className="text-[11px] text-muted-foreground/70">{limit.hint}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
