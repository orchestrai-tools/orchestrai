import type { DetectedAgent, DetectedLanguageServer } from "@warpforge/protocol";

/** How many installed agents the daemon reports as out of date. */
export function agentUpdateCount(agents: Pick<DetectedAgent, "status">[] | undefined): number {
  if (!agents) return 0;
  return agents.reduce((count, agent) => (agent.status === "behind" ? count + 1 : count), 0);
}

/** How many installed language servers the daemon reports as out of date. */
export function lspUpdateCount(
  servers: Pick<DetectedLanguageServer, "status" | "installed">[] | undefined,
): number {
  if (!servers) return 0;
  return servers.reduce(
    (count, server) => (server.installed && server.status === "behind" ? count + 1 : count),
    0,
  );
}
