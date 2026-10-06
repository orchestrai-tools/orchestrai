import { daemon } from "@warpforge/daemon";
import type { PullThread } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Textarea } from "@warpforge/ui/components/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  codeCommentCounts,
  commentHeading,
  isActivityItem,
  outdatedQuote,
  reviewerLabel,
  reviewRoster,
} from "../lib/pull-thread";
import { Markdown } from "./markdown";

function Heading({ children, aside }: { children: string; aside?: string }) {
  return (
    <h3 className="flex items-center text-xs font-medium text-muted-foreground">
      {children}
      {aside && <span className="ml-auto font-normal">{aside}</span>}
    </h3>
  );
}

/** The pull request's reviewers and conversation, with a comment and a reply on a thread. */
export function PullThreadView({
  project,
  number,
  requests,
  author,
  onOpenDiff,
}: {
  project: string;
  number: number;
  requests?: readonly string[];
  author?: string;
  onOpenDiff?: () => void;
}) {
  const [thread, setThread] = useState<PullThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  function load() {
    daemon
      .pullThread(project, number)
      .then((next) => {
        setThread(next);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load the conversation"),
      );
  }

  useEffect(() => {
    setThread(null);
    setReplyTo(null);
    load();
  }, [project, number]);

  async function post() {
    const text = body.trim();
    if (!text) return;
    try {
      await daemon.postPullComment(project, number, text, replyTo ?? undefined);
      setBody("");
      setReplyTo(null);
      toast.success(replyTo ? "Replied on the thread" : "Posted the comment");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post the comment");
    }
  }

  const comments = thread?.comments ?? [];
  const roster = reviewRoster(requests, comments);
  const waiting = !thread && !error && roster.length === 0;
  const activity = comments.filter(isActivityItem);
  const codeComments = codeCommentCounts(comments);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1.5">
        <Heading>Reviewers</Heading>
        {waiting && <p className="text-xs text-muted-foreground">Loading reviewers…</p>}
        {!waiting && roster.length === 0 && (
          <p className="text-xs text-muted-foreground">Nobody is asked yet.</p>
        )}
        {roster.length > 0 && (
          <ul>
            {roster.map((reviewer) => (
              <li key={reviewer.login} className="flex items-center gap-2 py-0.5 text-xs">
                <span>{reviewer.login}</span>
                <span
                  className={
                    reviewer.state === "CHANGES_REQUESTED"
                      ? "ml-auto text-foreground"
                      : "ml-auto text-muted-foreground"
                  }
                >
                  {reviewerLabel(reviewer.state)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Heading aside={author ? `Opened by ${author}` : undefined}>Conversation</Heading>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}{" "}
            <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={load}>
              Retry
            </Button>
          </p>
        )}
        {thread?.truncated && (
          <p className="text-xs text-muted-foreground">GitHub cut the rest of the conversation.</p>
        )}
        {thread && activity.length === 0 && (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        )}
        <ol className="flex flex-col gap-3">
          {activity.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 border-l pl-3">
              <span className="text-xs font-medium">{commentHeading(comment)}</span>
              {comment.kind === "review_comment" && (
                <span className="text-xs text-muted-foreground">
                  Outdated{comment.path ? ` · ${comment.path}` : ""}
                </span>
              )}
              {outdatedQuote(comment) && (
                <pre className="overflow-x-auto rounded-sm bg-muted px-2 py-1 font-mono text-xs">
                  {outdatedQuote(comment)}
                </pre>
              )}
              {comment.body.trim() && (
                <Markdown allowHtml className="text-sm">
                  {comment.body}
                </Markdown>
              )}
              {(codeComments.get(comment.id) ?? 0) > 0 && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto justify-start px-0 text-xs"
                  onClick={onOpenDiff}
                >
                  {codeComments.get(comment.id)} code{" "}
                  {codeComments.get(comment.id) === 1 ? "comment" : "comments"}
                </Button>
              )}
              {comment.replies.map((reply) => (
                <div key={reply.id} className="flex flex-col gap-0.5 pl-3">
                  <span className="text-xs text-muted-foreground">{commentHeading(reply)}</span>
                  {reply.body.trim() && (
                    <Markdown allowHtml className="text-sm">
                      {reply.body}
                    </Markdown>
                  )}
                </div>
              ))}
              {comment.threadId && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="self-start text-xs text-muted-foreground"
                  onClick={() => setReplyTo(comment.threadId ?? null)}
                >
                  Reply
                </Button>
              )}
            </li>
          ))}
        </ol>
        <Textarea
          value={body}
          aria-label={replyTo ? "Reply on this thread" : "Comment on this pull request"}
          placeholder={replyTo ? "Reply on this thread" : "Comment on this pull request"}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void post();
            }
          }}
          className="min-h-16 text-sm"
        />
        <div className="flex justify-end gap-1.5">
          {replyTo && (
            <Button variant="ghost" size="xs" onClick={() => setReplyTo(null)}>
              Cancel reply
            </Button>
          )}
          <Button size="xs" disabled={!body.trim()} onClick={() => void post()}>
            {replyTo ? "Reply" : "Comment"}
          </Button>
        </div>
      </section>
    </div>
  );
}
