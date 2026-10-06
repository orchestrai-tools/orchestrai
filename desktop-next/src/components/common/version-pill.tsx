import { Badge } from "@warpforge/ui/components/badge";
import { cn } from "@warpforge/ui/lib/utils";
import { CircleAlertIcon, DownloadIcon, LoaderCircleIcon } from "lucide-react";

/** Where an installable tool stands, as both agents and language servers report it. */
export type VersionState = "current" | "behind" | "missing" | "broken" | "installing" | "unknown";

export interface VersionInfo {
  state: VersionState;
  version?: string | null;
  latest?: string | null;
}

/** Maps a daemon detection result onto the pill's states. */
export function versionState(tool: {
  installed: boolean;
  status?: string | null;
  broken?: boolean;
  busy?: boolean;
}): VersionState {
  if (tool.busy) return "installing";
  if (tool.broken) return "broken";
  if (!tool.installed || tool.status === "missing") return "missing";
  if (tool.status === "behind") return "behind";
  if (tool.status === "current") return "current";
  return "unknown";
}

const v = (version: string) => (version.startsWith("v") ? version : `v${version}`);

/** Version pills as Warpforge showed them: green when current, amber with the new version when behind. */
export function VersionPill({ state, version, latest }: VersionInfo) {
  if (state === "installing")
    return (
      <Badge variant="secondary">
        <LoaderCircleIcon className="animate-spin" />
        Installing…
      </Badge>
    );
  if (state === "missing")
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        <DownloadIcon />
        not found
      </Badge>
    );
  if (state === "broken")
    return (
      <Badge variant="destructive">
        <CircleAlertIcon />
        cannot start
      </Badge>
    );
  if (state === "behind")
    return (
      <Badge
        title="Update available"
        className="border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300"
      >
        {version && latest ? `${v(version)} → ${v(latest)}` : "update available"}
      </Badge>
    );
  return (
    <Badge
      className={cn(
        "border-transparent",
        state === "current"
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {version ? v(version) : "installed"}
    </Badge>
  );
}
