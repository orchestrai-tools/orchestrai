import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { EllipsisIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { runStatus, StatusDot } from "../../components/common/status-mark";
import { agentActivity } from "../../lib/channel-members";
import type { ChannelMention } from "../../lib/channel-mention";
import { AuthorMark } from "./author-mark";

function Group({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center gap-2 px-2">
        <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function RowMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; run: () => void; separated?: boolean }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${label}`}
          className="ml-auto opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={item.run}>{item.label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Who is in the room: the people who have posted, and the project's enabled agents with what each is doing. */
export function MembersPanel({
  people,
  agents,
  tasks,
  onMention,
  onOpenTask,
  onManageAgents,
}: {
  people: string[];
  agents: ChannelMention[];
  tasks: TaskInfo[];
  onMention: (id: string) => void;
  onOpenTask: (id: string) => void;
  onManageAgents: () => void;
}) {
  return (
    <aside
      aria-label="Members"
      className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l px-2 py-4"
    >
      <Group label="People" count={people.length}>
        {people.map((name) => (
          <li
            key={name}
            className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) hover:bg-muted/40"
          >
            <AuthorMark name={name} agent={false} className="size-6" />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
          </li>
        ))}
      </Group>

      <Group label="Agents" count={agents.length}>
        {agents.length === 0 && (
          <li className="px-2 text-xs text-muted-foreground">
            No agents enabled.{" "}
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              onClick={onManageAgents}
            >
              Set one up
            </Button>
          </li>
        )}
        {agents.map((agent) => {
          const activity = agentActivity(agent.id, tasks);
          const task = activity.taskId
            ? tasks.find((entry) => entry.id === activity.taskId)
            : undefined;
          return (
            <li
              key={agent.id}
              className="group/row flex items-center gap-2 rounded-md px-2 py-(--row-py) hover:bg-muted/40"
            >
              <AuthorMark name={agent.name} agent className="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{agent.name}</span>
                {task ? (
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex max-w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <StatusDot status={runStatus(task)} />
                    <span className="truncate">{activity.text}</span>
                  </button>
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">
                    {activity.text}
                  </span>
                )}
              </span>
              <RowMenu
                label={agent.name}
                items={[
                  { label: "Mention", run: () => onMention(agent.id) },
                  ...(task ? [{ label: "Open its task", run: () => onOpenTask(task.id) }] : []),
                  { label: "Agent settings", run: onManageAgents, separated: true },
                ]}
              />
            </li>
          );
        })}
      </Group>
    </aside>
  );
}
