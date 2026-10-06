import { daemon } from "@warpforge/daemon";
import type { TrackerStatus } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { EmailText } from "../../components/email-text";
import { ErrorLine, Group, Row, fail } from "./primitives";

type Account = "linear" | "github";

const ACCOUNTS: readonly {
  id: Account;
  name: string;
  detail: string;
  hint: string;
  optional?: boolean;
}[] = [
  {
    id: "github",
    name: "GitHub",
    detail: "Pull requests, checks, and issues for every project.",
    hint: "ghp_… or github_pat_…, or leave empty to use gh auth",
    optional: true,
  },
  {
    id: "linear",
    name: "Linear",
    detail: "Imports issues into the backlog. Pick a team per project under Issue tracker.",
    hint: "lin_api_…",
  },
];

function accountLabel(status: TrackerStatus | null, id: Account): string | null {
  if (id === "linear") return status?.linear?.connected ? status.linear.email || "connected" : null;
  return status?.github?.connected ? status.github.login || "connected" : null;
}

/** Issue trackers every project uses: the GitHub and Linear tokens, connected or not. */
export function IssueTrackers() {
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<Account, string>>({ linear: "", github: "" });
  const [busy, setBusy] = useState<Account | null>(null);
  const [disconnecting, setDisconnecting] = useState<Account | null>(null);

  function load() {
    void daemon
      .trackerStatus()
      .then((next) => {
        setStatus(next);
        setError(null);
      })
      .catch((err: unknown) => setError(fail(err, "Could not read the connected accounts")));
  }

  useEffect(load, []);

  async function connect(id: Account) {
    setBusy(id);
    try {
      const token = drafts[id].trim();
      const next =
        id === "linear"
          ? await daemon.connectLinear(token)
          : await daemon.connectGithub(token || undefined);
      setStatus(next);
      setDrafts((current) => ({ ...current, [id]: "" }));
    } catch (err) {
      toast.error(fail(err, `Could not connect ${id === "linear" ? "Linear" : "GitHub"}`));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: Account) {
    try {
      setStatus(
        id === "linear" ? await daemon.disconnectLinear() : await daemon.disconnectGithub(),
      );
    } catch (err) {
      toast.error(fail(err, "Could not disconnect"));
    }
  }

  const leaving = ACCOUNTS.find((entry) => entry.id === disconnecting);

  return (
    <>
      <Group
        title="Issue trackers"
        note="Tokens stay with OrchestrAI on this Mac, never in a project."
      >
        {error && <ErrorLine message={error} onRetry={load} />}
        {ACCOUNTS.map((entry) => {
          const account = accountLabel(status, entry.id);
          return (
            <Row
              key={entry.id}
              title={
                <span className="flex items-baseline gap-2">
                  {entry.name}
                  {account && (
                    <span className="text-xs font-normal text-muted-foreground">
                      <EmailText text={account} />
                    </span>
                  )}
                </span>
              }
              description={entry.detail}
              control={
                account ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setDisconnecting(entry.id)}
                  >
                    Disconnect…
                  </Button>
                ) : undefined
              }
            >
              {!account && status && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connect(entry.id);
                  }}
                >
                  <Input
                    type="password"
                    value={drafts[entry.id]}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [entry.id]: event.target.value }))
                    }
                    placeholder={entry.hint}
                    aria-label={`${entry.name} token`}
                    className="h-7 min-w-0 flex-1 font-mono text-xs md:text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="text-xs"
                    disabled={busy === entry.id || (!entry.optional && !drafts[entry.id].trim())}
                  >
                    {busy === entry.id ? "Connecting…" : "Connect"}
                  </Button>
                </form>
              )}
            </Row>
          );
        })}
      </Group>

      <ConfirmDialog
        open={leaving != null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        title={`Disconnect ${leaving?.name ?? ""}?`}
        description={
          leaving?.id === "linear"
            ? "The key is removed. Issue sync from Linear stops in every project until you connect again."
            : "The token is removed. Pull requests, checks, and issue sync stop in every project until you connect again."
        }
        confirmLabel="Disconnect"
        onConfirm={() => disconnecting && void disconnect(disconnecting)}
      />
    </>
  );
}
