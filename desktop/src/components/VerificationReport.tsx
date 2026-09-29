import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { daemon } from "../daemon";
import type { WorkflowEvidence, WorkflowVerification, WorkflowVerifyVerdict } from "../protocol";

const VERDICT_VISUAL: Record<WorkflowVerifyVerdict, { label: string; tone: string }> = {
  blocked: { label: "BLOCKED", tone: "bg-warn/12 text-warn" },
  fail: { label: "FAIL", tone: "bg-destructive/12 text-destructive" },
  pass: { label: "PASS", tone: "bg-ok/12 text-ok" },
};

/** A verify stage's verdict as a pill; "testing" while it has none yet. */
export function VerifyVerdictBadge({
  verdict,
  className,
}: {
  verdict: WorkflowVerifyVerdict | null | undefined;
  className?: string;
}) {
  const visual = verdict
    ? VERDICT_VISUAL[verdict]
    : { label: "testing", tone: "bg-primary/10 text-primary" };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        visual.tone,
        className,
      )}
    >
      {visual.label}
    </span>
  );
}

/**
 * One screenshot a verify stage kept. The bytes live with the daemon, not at
 * a URL the WebView can load, so they arrive over RPC and render from a data
 * URL; a click opens it full size.
 */
function EvidenceImage({ parentId, evidence }: { parentId: string; evidence: WorkflowEvidence }) {
  const [enlarged, setEnlarged] = useState(false);
  const image = useQuery({
    gcTime: Infinity,
    queryFn: () => daemon.workflowEvidence(parentId, evidence.name),
    queryKey: ["workflowEvidence", parentId, evidence.name],
    staleTime: Infinity,
  });
  if (image.isPending) {
    return (
      <SkeletonBlock
        role="status"
        aria-label={evidence.name}
        className="aspect-video w-40 rounded-md"
      />
    );
  }
  if (!image.data) {
    return (
      <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
        {evidence.name} unavailable
      </span>
    );
  }
  const src = `data:${image.data.contentType};base64,${image.data.dataBase64}`;
  return (
    <>
      <button
        type="button"
        title={`Open ${evidence.name}`}
        onClick={() => setEnlarged(true)}
        className="flex w-40 flex-col overflow-hidden rounded-md border border-border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={src} alt={evidence.name} className="aspect-video w-full object-cover" />
        <span className="truncate px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {evidence.name}
        </span>
      </button>
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-h-[90vh] w-[min(95vw,1400px)] max-w-[95vw] overflow-auto p-4">
          <DialogTitle className="text-sm">{evidence.name}</DialogTitle>
          <img src={src} alt={evidence.name} className="max-w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

const STEP_TONE = {
  fail: "text-destructive",
  pass: "text-ok",
  skipped: "text-muted-foreground",
} as const;

/** What a verify stage tested, what happened, and the screenshots it kept. */
export function VerificationReport({
  parentId,
  verification,
}: {
  parentId: string;
  verification: WorkflowVerification;
}) {
  return (
    <section aria-label="Verification" className="flex flex-col gap-2 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">Verification</span>
        <VerifyVerdictBadge verdict={verification.verdict} />
        <span className="tnum text-muted-foreground">attempt {verification.attempt}</span>
      </div>
      {verification.summary && (
        <p className="whitespace-pre-wrap text-muted-foreground">{verification.summary}</p>
      )}
      {verification.checklist.length > 0 && (
        <ul className="flex flex-col gap-1">
          {verification.checklist.map((item) => (
            <li key={`${item.status}:${item.step}`} className="flex gap-2">
              <span className={cn("w-10 shrink-0 font-semibold uppercase", STEP_TONE[item.status])}>
                {item.status === "skipped" ? "skip" : item.status}
              </span>
              <span className="min-w-0 text-foreground">
                {item.step}
                {item.note && <span className="text-muted-foreground"> — {item.note}</span>}
                {item.evidence && item.evidence.length > 0 && (
                  <span className="text-muted-foreground"> ({item.evidence.join(", ")})</span>
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
    </section>
  );
}
