import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR } from "@warpforge/protocol";
import type { ProjectInfo, ServiceInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@warpforge/ui/components/popover";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { portRangeSourceLabel, portRangeSourceTitle } from "../../components/port-range-conflict";
import { normalizePortRange, portRangeInputError } from "../../lib/port-range";
import { Notice } from "./status";

/** Writes a machine-local range; the team's shared config is never touched. */
export function RangeForm({ project, onDone }: { project: string; onDone?: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function apply() {
    const invalid = portRangeInputError(value);
    setError(invalid);
    const next = normalizePortRange(value);
    if (invalid || !next) return;
    setSaving(true);
    try {
      await daemon.setProjectPortRange(project, next);
      setValue("");
      toast.success("Port range saved on this machine");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The daemon rejected this range");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void apply();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="e.g. 4500-4599"
          aria-label={`New local port range for ${project}`}
          aria-invalid={error !== null}
          className="h-7 w-36 font-mono text-xs md:text-xs"
        />
        <Button type="submit" size="sm" className="text-xs" disabled={saving}>
          Set on this machine
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

function clearOverride(project: string) {
  void daemon
    .setProjectPortRange(project, null)
    .then(() => toast.success("Local port override cleared"))
    .catch((err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not clear the override"),
    );
}

/** Two projects claim the same block, so this one's services refuse to start until one moves. */
export function RangeConflict({ project }: { project: ProjectInfo }) {
  if (!project.portRangeConflict) return null;
  const [start, end] = project.portRange;
  return (
    <div
      role="alert"
      className="mx-4 mb-3 flex flex-col gap-2 rounded-md border border-red-500/30 px-3 py-2.5"
    >
      <p className="text-sm font-medium text-red-600 dark:text-red-400">
        Port range conflict with {project.portRangeConflict}
      </p>
      <p className="text-xs text-muted-foreground">
        Both projects use ports {start}–{end}, so services here will not start. Pick another block
        for this machine. The shared config stays as it is.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <RangeForm project={project.name} />
        {project.portRangeSource === "localOverride" && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => clearOverride(project.name)}
          >
            Clear override
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConfigErrors({ project }: { project: ProjectInfo }) {
  if (project.configError) {
    return (
      <div className="mx-4 mb-3">
        <Notice tone="warn">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span>
            The workspace file (<span className="font-mono">{PROJECT_DIR}/workspace.yaml</span>) has an
            error and is not applied until it is fixed:{" "}
            <span className="font-mono">{project.configError}</span>
          </span>
        </Notice>
      </div>
    );
  }
  if (!project.localConfigError) return null;
  return (
    <div className="mx-4 mb-3">
      <Notice tone="warn">
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
        <span>
          Your local config (<span className="font-mono">{PROJECT_DIR}/workspace.local.yaml</span>) has
          an error and is ignored, so this shows the shared config only:{" "}
          <span className="font-mono">{project.localConfigError}</span>
        </span>
      </Notice>
    </div>
  );
}

/** The project's port block, where it came from, and how much of it is handed out. */
export function PortRangeFooter({
  project,
  services,
}: {
  project: ProjectInfo;
  services: ServiceInfo[];
}) {
  const [open, setOpen] = useState(false);
  const [start, end] = project.portRange;
  const size = end - start + 1;
  const used = services.filter(
    (svc) => svc.allocatedPort >= start && svc.allocatedPort <= end,
  ).length;
  const source = portRangeSourceLabel(project.portRangeSource);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium tabular-nums">
            Ports {start}–{end}
          </p>
          <p
            className="text-muted-foreground"
            title={portRangeSourceTitle(project.portRangeSource)}
          >
            {source ? `${source} · ` : ""}
            {used} of {size} in use
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="text-xs">
              Change
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-80">
            <PopoverHeader>
              <PopoverTitle>Port range on this machine</PopoverTitle>
              <PopoverDescription className="text-xs">
                {project.portRangeSource === "declared"
                  ? "Overrides the team's ports.range here only. To move it for everyone, edit ports.range in the workspace file."
                  : "Replaces the automatic assignment here only."}
              </PopoverDescription>
            </PopoverHeader>
            <RangeForm project={project.name} onDone={() => setOpen(false)} />
            {project.portRangeSource === "localOverride" && (
              <Button
                variant="outline"
                size="sm"
                className="self-start text-xs"
                onClick={() => {
                  clearOverride(project.name);
                  setOpen(false);
                }}
              >
                Clear override
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
