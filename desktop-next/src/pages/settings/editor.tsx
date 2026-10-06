import { daemon } from "@warpforge/daemon";
import type { DetectedLanguageServer } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { VersionPill, versionState } from "../../components/common/version-pill";
import { useLspRefresh } from "../../lib/lsp-palette";
import { useShell } from "../../lib/shell-store";
import { refreshToolUpdates, useToolUpdates } from "../../lib/tool-updates";
import { ErrorLine, Group, Quiet, Row, SwitchRow } from "./primitives";

function lastLine(output: string): string {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/A complete log of this run/.test(line));
  return lines[lines.length - 1] ?? "install failed";
}

/** What the pill cannot say: how to install a server the app does not manage. */
function serverNote(server: DetectedLanguageServer): string | undefined {
  if (!server.installed && !server.canManage) return server.installHint;
  return undefined;
}

/** The code view's language servers: the on/off switch, then each detected server with its version. */
export function LanguageServers() {
  const lspEnabled = useShell((state) => state.lspEnabled);
  const [servers, setServers] = useState<DetectedLanguageServer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const refreshTick = useLspRefresh((state) => state.tick);

  function load() {
    setLoading(true);
    void daemon
      .detectLanguageServers()
      .then((next) => {
        setServers(next);
        useToolUpdates.setState({ servers: next });
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not detect language servers"),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [refreshTick]);

  async function manage(id: string) {
    setBusy(id);
    setFailures((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const result = await daemon.installLanguageServer(id);
      if (!result.ok) setFailures((current) => ({ ...current, [id]: lastLine(result.output) }));
      setServers(await daemon.detectLanguageServers());
    } catch (err) {
      setFailures((current) => ({
        ...current,
        [id]: err instanceof Error ? err.message : "install failed",
      }));
    } finally {
      setBusy(null);
      refreshToolUpdates();
    }
  }

  return (
    <Group
      title="Language servers"
      note="Started when a code file opens, one per project and language. Without one, files still get syntax colors."
    >
      <SwitchRow
        title="Language features"
        description="Hover, go to definition, and diagnostics in the code view."
        checked={lspEnabled}
        onChange={(on) => useShell.getState().setLspEnabled(on)}
      />
      {error && <ErrorLine message={error} onRetry={load} />}
      {loading && servers.length === 0 && <Quiet>Looking for language servers…</Quiet>}
      {!error && !loading && servers.length === 0 && <Quiet>No language servers detected.</Quiet>}
      {servers.map((server) => {
        const behind = server.status === "behind";
        const working = busy === server.id;
        return (
          <Row
            key={server.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {server.language}
                <VersionPill
                  state={versionState({
                    installed: server.installed,
                    status: server.status,
                    busy: working,
                  })}
                  version={server.version}
                  latest={server.latestVersion}
                />
              </span>
            }
            description={serverNote(server)}
            control={
              server.canManage &&
              (!server.installed || behind) && (
                <Button
                  size="sm"
                  className="text-xs"
                  variant={behind ? "default" : "secondary"}
                  disabled={working}
                  onClick={() => void manage(server.id)}
                >
                  {working && <LoaderCircleIcon className="animate-spin" />}
                  {working ? "Working…" : server.installed ? "Update" : "Install"}
                </Button>
              )
            }
          >
            {failures[server.id] && (
              <p className="font-mono text-xs text-red-600 dark:text-red-400">
                {failures[server.id]}
              </p>
            )}
          </Row>
        );
      })}
      <div className="py-[calc(var(--row-py)+0.25rem)]">
        <Button variant="outline" size="sm" className="text-xs" disabled={loading} onClick={load}>
          <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          {loading ? "Checking versions…" : "Check versions"}
        </Button>
      </div>
    </Group>
  );
}
