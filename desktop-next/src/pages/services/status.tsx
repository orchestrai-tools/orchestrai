import type { PortForwardStatus, ServiceStatus } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import type { ReactNode } from "react";
import { PINNED_PORT_TITLE, localConfigTitle } from "../../lib/selected-service";

export type RuntimeStatus = ServiceStatus | PortForwardStatus;

const TONE: Record<RuntimeStatus, string> = {
  running: "bg-emerald-500",
  active: "bg-emerald-500",
  starting: "bg-amber-500 animate-pulse",
  restarting: "bg-amber-500 animate-pulse",
  failed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
};

export const STATUS_TEXT: Record<RuntimeStatus, string> = {
  running: "Running",
  active: "Active",
  starting: "Starting",
  restarting: "Reconnecting",
  failed: "Failed",
  stopped: "Stopped",
};

/** The same dot for a service and a port-forward, so the two lists scan as one. */
export function RuntimeDot({ status, className }: { status: RuntimeStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE[status], className)}
    />
  );
}

const MARK = "shrink-0 rounded-sm border px-1 text-xs leading-4 text-muted-foreground";

/** Shown when the personal local config file added or changed this item. */
export function LocalMark({
  name,
  local,
  fields,
}: {
  name: string;
  local?: boolean;
  fields?: string[];
}) {
  if (!local && !fields?.length) return null;
  const title = localConfigTitle(name, fields);
  return (
    <span title={title} aria-label={title} className={MARK}>
      local
    </span>
  );
}

/** Shown when the declared port is a hard requirement rather than a hint. */
export function PinnedMark({ name, pinned }: { name: string; pinned?: boolean }) {
  if (!pinned) return null;
  return (
    <span title={PINNED_PORT_TITLE} aria-label={`${name} port is pinned`} className={MARK}>
      pinned
    </span>
  );
}

/** One line of state under a detail header: red for a failure, amber for a warning, quiet for progress. */
export function Notice({
  tone,
  children,
}: {
  tone: "danger" | "warn" | "quiet";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "quiet" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 text-xs",
        tone === "danger" && "text-red-600 dark:text-red-400",
        tone === "warn" && "text-amber-700 dark:text-amber-400",
        tone === "quiet" && "text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
