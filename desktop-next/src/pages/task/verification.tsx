import { daemon } from "@warpforge/daemon";
import type { WorkflowEvidence, WorkflowVerification } from "@warpforge/protocol";
import { Dialog, DialogContent, DialogTitle } from "@warpforge/ui/components/dialog";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { cn } from "@warpforge/ui/lib/utils";
import { CheckIcon, MinusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Frame } from "./attention-card";

const VERDICT_TONE = { pass: "sky", fail: "red", blocked: "amber" } as const;

/** What a verify stage tested, step by step, with the screenshots it kept. */
export function VerificationReport({
  parentId,
  verification,
}: {
  parentId: string;
  verification: WorkflowVerification;
}) {
  const verdict = verification.verdict;
  return (
    <Frame
      tone={verdict ? VERDICT_TONE[verdict] : "neutral"}
      label={`Verification ${verdict ?? "testing"} · attempt ${verification.attempt}`}
    >
      {verification.summary && <p className="text-sm">{verification.summary}</p>}
      {verification.checklist.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {verification.checklist.map((item) => (
            <li key={`${item.status}:${item.step}`} className="flex items-start gap-2">
              {item.status === "pass" ? (
                <CheckIcon
                  aria-label="Passed"
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
              ) : item.status === "fail" ? (
                <XIcon aria-label="Failed" className="mt-0.5 size-3.5 shrink-0 text-red-500" />
              ) : (
                <MinusIcon
                  aria-label="Skipped"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span className={cn("min-w-0", item.status === "skipped" && "text-muted-foreground")}>
                {item.step}
                {item.note && <span className="text-muted-foreground"> — {item.note}</span>}
                {item.evidence && item.evidence.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    ({item.evidence.join(", ")})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {verification.evidence.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {verification.evidence.map((evidence) => (
            <EvidenceImage key={evidence.name} parentId={parentId} evidence={evidence} />
          ))}
        </div>
      )}
    </Frame>
  );
}

function EvidenceImage({ parentId, evidence }: { parentId: string; evidence: WorkflowEvidence }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void daemon
      .workflowEvidence(parentId, evidence.name)
      .then((image) => {
        if (!cancelled) setSrc(`data:${image.contentType};base64,${image.dataBase64}`);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [parentId, evidence.name]);

  if (error)
    return <span className="text-xs text-muted-foreground">{evidence.name} unavailable</span>;
  if (!src) return <Skeleton aria-label={`Loading ${evidence.name}`} className="h-24 w-40" />;

  return (
    <>
      <button
        type="button"
        title={`Open ${evidence.name}`}
        onClick={() => setOpen(true)}
        className="flex w-40 flex-col gap-1 rounded-md text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <img
          alt={evidence.name}
          src={src}
          className="h-24 w-40 rounded-sm border object-cover object-top"
        />
        <span className="truncate">{evidence.name}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
          <DialogTitle className="text-sm">{evidence.name}</DialogTitle>
          <img alt={evidence.name} src={src} className="w-full rounded-sm" />
        </DialogContent>
      </Dialog>
    </>
  );
}
