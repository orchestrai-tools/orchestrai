import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { useState, type ReactNode } from "react";
import { formatElapsed } from "../../lib/live-line";
import { useDaemon } from "../../lib/use-daemon";
import { agentName, type SessionRow } from "./session-rows";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** Continue loads a session the agent saved elsewhere, with its history, and runs it here as a task. */
export function ContinueSessionDialog({
  row,
  onOpenChange,
  onConfirm,
}: {
  row: SessionRow | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (row: SessionRow) => Promise<void>;
}) {
  const agents = useDaemon().snapshot.agents;
  const [busy, setBusy] = useState(false);
  const session = row?.external;
  const name = row ? agentName(agents, row.agent) : "";

  async function confirm() {
    if (!row) return;
    setBusy(true);
    try {
      await onConfirm(row);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {row && session && (
          <>
            <DialogHeader>
              <DialogTitle>Continue this session</DialogTitle>
              <DialogDescription>
                {name} loads it with its history, and from then on it runs here as a task.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <Row label="Session">{row.title}</Row>
              <Row label="Agent">{name}</Row>
              <Row label="History">
                {session.messageCount === 1 ? "1 message" : `${session.messageCount} messages`}
              </Row>
              {session.updatedAt > 0 && (
                <Row label="Last used">
                  {formatElapsed(session.updatedAt, Math.floor(Date.now() / 1000))} ago
                </Row>
              )}
              <Row label="Id">
                <span className="font-mono text-xs break-all">{session.sessionId}</span>
              </Row>
            </dl>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void confirm()}>
                {busy ? "Loading…" : "Continue"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
