import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import type { PortRangeSource, ProjectInfo } from "@warpforge/protocol";
import { useState } from "react";
import { toast } from "sonner";
import { normalizePortRange, portRangeInputError } from "../lib/port-range";

const SOURCE_LABEL: Record<PortRangeSource, string> = {
  auto: "auto-assigned",
  sticky: "auto-assigned (kept)",
  declared: "from team config",
  localOverride: "local override",
};

const SOURCE_TITLE: Record<PortRangeSource, string> = {
  auto: "Chosen automatically from free ports on this machine.",
  sticky: "Kept from an earlier automatic assignment on this machine.",
  declared: "Declared in the project's shared config. Every machine on the team uses this range.",
  localOverride: "Overridden on this machine only. The team's shared config is unchanged.",
};

export function portRangeSourceLabel(source: PortRangeSource | undefined): string | null {
  return source ? SOURCE_LABEL[source] : null;
}

export function portRangeSourceTitle(source: PortRangeSource | undefined): string | undefined {
  return source ? SOURCE_TITLE[source] : undefined;
}

/** Conflict banner. A new range is a local override and leaves the shared config alone. */
export function PortRangeConflict({ project }: { project: ProjectInfo }) {
  const [range, setRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!project.portRangeConflict) return null;
  const hasOverride = project.portRangeSource === "localOverride";

  async function apply() {
    const invalid = portRangeInputError(range);
    setError(invalid);
    if (invalid) return;
    const next = normalizePortRange(range);
    if (!next) return;
    setSaving(true);
    try {
      await daemon.setProjectPortRange(project.name, next);
      setRange("");
      toast.success("Port range saved on this machine");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The daemon rejected this range");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await daemon.setProjectPortRange(project.name, null);
      toast.success("Local port override cleared");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear the override");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-l-2 border-l-destructive bg-card p-3 text-sm">
      <p className="font-medium text-destructive">Port range conflict with {project.portRangeConflict}</p>
      <p className="text-xs text-muted-foreground">
        Both projects use ports {project.portRange[0]}–{project.portRange[1]}, so this project's services will not start.
        A range set here affects only this machine.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-36 font-mono text-xs"
          aria-label={`New local port range for ${project.name}`}
          value={range}
          placeholder="4300-4399"
          onChange={(event) => {
            setRange(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void apply();
          }}
        />
        <Button size="sm" disabled={saving} onClick={() => void apply()}>
          Set range on this machine
        </Button>
        {hasOverride && (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void clear()}>
            Clear override
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
