import { daemon } from "@warpforge/daemon";
import type { PullCommit, PullThread } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Kbd } from "@warpforge/ui/components/kbd";
import { Textarea } from "@warpforge/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isTypingTarget } from "../../lib/editor-nav";
import type { CommitRange } from "../../lib/pull-commits";
import {
  appendSuggestion,
  commentSpan,
  pairHunkLines,
  parseUnifiedPatch,
  reviewThreadsByLine,
  suggestionSeed,
  type LineDraft,
} from "../../lib/pull-diff";
import { diffFileKeyAction } from "../../lib/pull-file-nav";
import {
  fingerprintPatchFile,
  pullViewedKey,
  setPullFileViewed,
  subscribePullViewed,
  viewedPathsSnapshot,
} from "../../lib/pull-viewed";
import { PullCommitPicker } from "./pull-commit-picker";
import { PullDiffFiles } from "./pull-diff-files";
import { LineList, type LineRef, type Reply } from "./pull-diff-lines";
import { errorText } from "./pull-meta";

/** A pull request diff, file by file, with review threads on the new-file lines. `[` and `]` step files. */
export function PullDiff({
  project,
  number,
  repo,
  patch,
  openPath,
  truncated = false,
}: {
  project: string;
  number: number;
  repo: string;
  patch: string;
  openPath?: string;
  truncated?: boolean;
}) {
  const [range, setRange] = useState<CommitRange | null>(null);
  const [rangePatch, setRangePatch] = useState<string | null>(null);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [commits, setCommits] = useState<PullCommit[]>([]);
  const shown = range ? (rangePatch ?? "") : patch;
  const blocks = useMemo(() => parseUnifiedPatch(shown), [shown]);
  const fingerprints = useMemo(() => {
    const map = new Map<string, string>();
    for (const block of blocks) map.set(block.path, fingerprintPatchFile(block));
    return map;
  }, [blocks]);
  const prKey = pullViewedKey({ repo, number });
  const viewed = useSyncExternalStore(
    subscribePullViewed,
    () => viewedPathsSnapshot(prKey, fingerprints),
    () => viewedPathsSnapshot(prKey, fingerprints),
  );
  const [path, setPath] = useState("");
  const [split, setSplit] = useState(false);
  const [thread, setThread] = useState<PullThread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<LineDraft | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const dragging = useRef(false);
  const active = blocks.find((block) => block.path === path) ?? blocks[0];

  useEffect(() => {
    if (openPath) setPath(openPath);
  }, [openPath]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = diffFileKeyAction(event, {
        paths: blocks.map((block) => block.path),
        active: active?.path ?? "",
        viewed,
        typing: isTypingTarget(event.target),
      });
      if (action?.toggle && active) {
        setPullFileViewed(
          prKey,
          active.path,
          fingerprints.get(active.path) ?? "",
          !viewed.has(active.path),
        );
      }
      if (action?.select) setPath(action.select);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, blocks, fingerprints, prKey, viewed]);

  function reload() {
    void daemon
      .pullThread(project, number)
      .then((next) => {
        setThread(next);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(errorText(err, "Could not load the conversation")));
  }

  useEffect(() => {
    reload();
    setRange(null);
    setRangePatch(null);
    void daemon
      .pullCommits(project, number)
      .then(setCommits)
      .catch((err: unknown) => setLoadError(errorText(err, "Could not load commits")));
  }, [project, number, attempt]);

  useEffect(() => {
    if (!range) {
      setRangePatch(null);
      setRangeTruncated(false);
      return;
    }
    let cancelled = false;
    setRangePatch(null);
    void daemon
      .pullDiff(project, number, range)
      .then((diff) => {
        if (cancelled) return;
        setRangePatch(diff.patch);
        setRangeTruncated(diff.truncated);
      })
      .catch((err: unknown) => toast.error(errorText(err, "Could not load that commit range")));
    return () => {
      cancelled = true;
    };
  }, [project, number, range]);

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const chooseLine = (next: LineRef, extend: boolean) =>
    setDraft((current) => commentSpan(current, next, extend));
  const threads = useMemo(() => reviewThreadsByLine(thread?.comments ?? []), [thread]);
  const onFile = active ? threads.get(active.path) : undefined;

  async function post() {
    if (!draft || !draft.body.trim()) return;
    try {
      await daemon.createPullReviewComment(project, number, {
        path: draft.path,
        line: draft.line,
        side: draft.side,
        body: draft.body.trim(),
        ...(draft.startLine === draft.line
          ? {}
          : { startLine: draft.startLine, startSide: draft.side }),
      });
      setDraft(null);
      toast.success("Started a review thread");
      reload();
    } catch (err) {
      toast.error(errorText(err, "Could not post the comment"));
    }
  }

  async function sendReply() {
    if (!reply?.body.trim()) return;
    try {
      await daemon.postPullComment(project, number, reply.body.trim(), reply.threadId);
      setReply(null);
      toast.success("Replied on the thread");
      reload();
    } catch (err) {
      toast.error(errorText(err, "Could not reply"));
    }
  }

  const lineProps = {
    path: active?.path ?? "",
    comments: onFile,
    draft,
    chooseLine,
    dragging,
    reply,
    setReply,
    onSendReply: sendReply,
  };
  const seed =
    active && draft ? suggestionSeed(active, draft.side, draft.startLine, draft.line) : [];

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {loadError}{" "}
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs"
            onClick={() => setAttempt((count) => count + 1)}
          >
            Retry
          </Button>
        </p>
      )}
      <PullCommitPicker commits={commits} range={range} onRange={setRange} />
      {!shown && (
        <p className="text-xs text-muted-foreground">
          {range ? "Loading that range…" : "Loading the diff…"}
        </p>
      )}
      {(range ? rangeTruncated : truncated) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          GitHub cut this diff off at its size cap.
        </p>
      )}
      {shown && !active && (
        <p className="text-xs text-muted-foreground">This pull request has no diff.</p>
      )}
      {active && (
        <>
          <PullDiffFiles
            blocks={blocks}
            active={active.path}
            viewed={viewed}
            onSelect={setPath}
            onViewed={(file, checked) =>
              setPullFileViewed(prKey, file, fingerprints.get(file) ?? "", checked)
            }
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate font-mono text-foreground" title={active.path}>
              {active.path}
            </span>
            <span className="shrink-0">
              {viewed.size} of {blocks.length} viewed
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Kbd>[</Kbd>
              <Kbd>]</Kbd> files
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={split ? "split" : "unified"}
              onValueChange={(next) => next && setSplit(next === "split")}
              aria-label="Diff layout"
            >
              <ToggleGroupItem value="unified" className="px-2 text-xs">
                Unified
              </ToggleGroupItem>
              <ToggleGroupItem value="split" className="px-2 text-xs">
                Split
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {active.binary && <p className="text-xs text-muted-foreground">Binary file.</p>}
          <div className="flex flex-col overflow-hidden rounded-md border">
            {active.hunks.map((hunk) => (
              <div key={hunk.id}>
                <p className="bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {hunk.header}
                </p>
                {split ? (
                  <div className="grid grid-cols-2 divide-x">
                    <LineList
                      {...lineProps}
                      side="LEFT"
                      lines={pairHunkLines(hunk.lines).map((row) => row.left)}
                    />
                    <LineList
                      {...lineProps}
                      side="RIGHT"
                      lines={pairHunkLines(hunk.lines).map((row) => row.right)}
                    />
                  </div>
                ) : (
                  <LineList {...lineProps} lines={hunk.lines} />
                )}
              </div>
            ))}
          </div>
          {draft && (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void post();
              }}
            >
              <Textarea
                autoFocus
                value={draft.body}
                aria-label="Line comment"
                placeholder={`Comment on ${draft.path}:${draft.startLine === draft.line ? draft.line : `${draft.startLine}–${draft.line}`} (⌘↵ to post)`}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setDraft(null);
                    return;
                  }
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void post();
                  }
                }}
                className="min-h-16 text-sm"
              />
              <div className="flex justify-end gap-1.5">
                {draft.side === "RIGHT" &&
                  !draft.body.includes("```suggestion") &&
                  seed.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      title="Propose a replacement for these lines"
                      onClick={() =>
                        setDraft({ ...draft, body: appendSuggestion(draft.body, seed) })
                      }
                    >
                      Suggest
                    </Button>
                  )}
                <Button type="button" variant="ghost" size="xs" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="xs" disabled={!draft.body.trim()}>
                  {draft.startLine === draft.line ? "Comment on line" : "Comment on lines"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
