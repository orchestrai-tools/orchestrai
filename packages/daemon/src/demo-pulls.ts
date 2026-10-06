/** Comments posted in demo mode, kept so a reload of the thread still shows them. */

interface DemoComment {
  author: { login: string };
  body: string;
  createdAt: string;
  id: string;
  kind: string;
  line?: number;
  path?: string;
  replies: DemoComment[];
  url: string;
}

const tops = new Map<number, DemoComment[]>();
const replies = new Map<string, DemoComment[]>();
let seq = 1;

export function resetDemoPulls() {
  tops.clear();
  replies.clear();
  seq = 1;
}

/** Store a conversation comment or a reply. Returns the comment URL. */
export function demoPullWrite(
  method: string,
  params: Record<string, unknown>,
): { url: string } | null {
  if (method === "tracker.pulls.reviewComment") {
    const number = Number(params.number);
    const id = `local-${seq++}`;
    const comment: DemoComment = {
      author: { login: "you" },
      body: String(params.body ?? ""),
      createdAt: new Date().toISOString(),
      id,
      kind: "review_comment",
      line: Number(params.line),
      path: String(params.path ?? ""),
      replies: [],
      url: `https://github.com/orchestrai/demo/pull/${number}#discussion_r${id}`,
    };
    const list = tops.get(number) ?? [];
    list.push(comment);
    tops.set(number, list);
    return { url: comment.url };
  }
  if (method !== "tracker.pulls.comment") return null;
  const number = Number(params.number);
  const thread = String(params.in_reply_to ?? "");
  const id = `local-${seq++}`;
  const comment: DemoComment = {
    author: { login: "you" },
    body: String(params.body ?? ""),
    createdAt: new Date().toISOString(),
    id,
    kind: thread ? "review_comment" : "comment",
    replies: [],
    url: `https://github.com/orchestrai/demo/pull/${number}#issuecomment-${id}`,
  };
  if (thread) {
    const list = replies.get(thread) ?? [];
    list.push(comment);
    replies.set(thread, list);
  } else {
    const list = tops.get(number) ?? [];
    list.push(comment);
    tops.set(number, list);
  }
  return { url: comment.url };
}

/** Attach stored replies and new comments onto a thread fixture. */
export function mergeDemoThread<
  T extends { comments: Array<{ threadId?: string; replies: unknown[] }> },
>(number: number, thread: T): T {
  const comments = thread.comments.map((comment) => {
    const extra = comment.threadId ? (replies.get(comment.threadId) ?? []) : [];
    if (extra.length === 0) return comment;
    return { ...comment, replies: [...comment.replies, ...extra] };
  });
  const added = tops.get(number) ?? [];
  if (added.length === 0 && comments === thread.comments) return thread;
  return { ...thread, comments: [...comments, ...added] };
}
