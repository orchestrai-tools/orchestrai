import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageToolbar } from "../components/common/page-toolbar";
import { useChannelPost, useChannelRefresh } from "../lib/channel-palette";
import { plural } from "../lib/plural";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { isAgentRole, type ChannelMessage } from "./channel/author-mark";
import { Composer } from "./channel/composer";
import { MembersPanel } from "./channel/members";
import { Thread } from "./channel/thread";
import { LoadError } from "./github/list-controls";
import { useTaskFiles } from "./task/use-task-files";

function ChannelRoom({ project }: { project: string }) {
  const state = useDaemon();
  const openTask = useShell((shell) => shell.openTask);
  const setPage = useShell((shell) => shell.setPage);
  const refreshTick = useChannelRefresh((store) => store.tick);
  const tasks = state.snapshot.tasks.filter((task) => task.project === project);
  const files = useTaskFiles(project, undefined);
  const agents = (state.snapshot.agents ?? [])
    .filter((agent) => agent.enabled)
    .map((agent) => ({ id: agent.id, name: agent.displayName }));
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const name = `#${project.split("/").filter(Boolean).pop() ?? project}`;

  const load = useCallback(() => {
    setLoading(true);
    void daemon
      .request("channel.list", { project })
      .then((result) => {
        setMessages((result as { messages?: ChannelMessage[] }).messages ?? []);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load the channel"),
      )
      .finally(() => setLoading(false));
  }, [project]);

  useEffect(load, [load, refreshTick]);

  async function post(role: "human" | "agent") {
    const body = draft.trim();
    if (!body) return;
    try {
      await daemon.request("channel.post", {
        project,
        author: role === "agent" ? "agent" : "you",
        role,
        body,
      });
      setDraft("");
      setError(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post");
    }
  }

  useChannelPost((role) => void post(role));

  const nameOf = (message: ChannelMessage) => {
    if (isAgentRole(message.role)) {
      return agents.find((agent) => agent.id === message.author)?.name ?? message.author;
    }
    return message.author === "you" ? "You" : message.author;
  };
  const people = [
    "You",
    ...new Set(
      messages
        .filter((message) => !isAgentRole(message.role) && message.author !== "you")
        .map((message) => message.author),
    ),
  ];
  const mention = (id: string) => {
    setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}@${id} `);
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <PageToolbar
          title={name}
          meta={`${plural(people.length, "person", "people")} · ${plural(agents.length, "agent")}`}
        >
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showMembers}
            onClick={() => setShowMembers((open) => !open)}
            className="text-xs"
          >
            {showMembers ? "Hide members" : `Members · ${people.length + agents.length}`}
          </Button>
        </PageToolbar>
        {error && <LoadError message={error} onRetry={load} />}
        <Thread
          messages={messages}
          loading={loading}
          nameOf={nameOf}
          mentionIds={agents.map((agent) => agent.id)}
          known={files.known}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onPost={(role) => void post(role)}
          agents={agents}
          channelName={name}
          input={input}
        />
      </div>
      {showMembers && (
        <MembersPanel
          people={people}
          agents={agents}
          tasks={tasks}
          onMention={mention}
          onOpenTask={(id) => openTask(id, project)}
          onManageAgents={() => setPage("agents")}
        />
      )}
    </div>
  );
}

/**
 * One room per project where people and agents post to the same thread.
 * `@` marks an agent in the message.
 */
export function Channel() {
  const project = useShell((shell) => shell.project);
  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <PageToolbar title="Channel" />
        <p className="py-10 text-center text-sm text-muted-foreground">
          Open a project to use its channel.
        </p>
      </div>
    );
  }
  return <ChannelRoom key={project} project={project} />;
}
