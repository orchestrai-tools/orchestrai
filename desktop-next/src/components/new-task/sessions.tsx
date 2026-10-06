import type { ExternalSession } from "@warpforge/protocol";
import { SectionLabel } from "../common/page-toolbar";

/** Agent sessions started outside the app that a new task can pick up where they left off. */
export function ContinueSessions({
  sessions,
  onResume,
}: {
  sessions: ExternalSession[];
  onResume: (session: ExternalSession) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>Or continue a session</SectionLabel>
      <ul className="max-h-36 overflow-y-auto">
        {sessions.slice(0, 8).map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              onClick={() => onResume(session)}
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-(--row-py) text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate">{session.title || session.sessionId}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {session.agent} · {session.messageCount} messages
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
