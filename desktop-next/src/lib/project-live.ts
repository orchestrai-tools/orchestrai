import type { Snapshot } from "@warpforge/protocol";

export interface ProjectLiveCounts {
  services: number;
  portforwards: number;
  terminals: number;
}

/** Running or starting services and port forwards, plus open terminals, for one project. */
export function projectLiveCounts(snapshot: Pick<Snapshot, "services" | "portforwards" | "terminals">, project: string): ProjectLiveCounts {
  const live = (status: string) => status === "running" || status === "starting";
  return {
    services: snapshot.services.filter((service) => service.project === project && live(service.status)).length,
    portforwards: snapshot.portforwards.filter((forward) => forward.project === project && live(forward.status)).length,
    terminals: snapshot.terminals.filter((terminal) => terminal.project === project).length,
  };
}

export function liveResourceSummary(counts: ProjectLiveCounts): string | null {
  const parts: string[] = [];
  if (counts.services > 0) parts.push(`${counts.services} service${counts.services === 1 ? "" : "s"}`);
  if (counts.portforwards > 0) parts.push(`${counts.portforwards} port forward${counts.portforwards === 1 ? "" : "s"}`);
  if (counts.terminals > 0) parts.push(`${counts.terminals} terminal${counts.terminals === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : null;
}
