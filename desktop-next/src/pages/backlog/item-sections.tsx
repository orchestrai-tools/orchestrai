import { daemon } from "@warpforge/daemon";
import type { BacklogItem, RunnerEntry } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@warpforge/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { StatusMark } from "../../components/common/status-mark";
import { openExternalLink } from "../../lib/external-link";
import { waitLabel } from "../../model/factory";
import type { LinkedTask } from "./backlog-row";
import { factoryLabel } from "./labels";
import type { Factory } from "./use-backlog";

/** A titled block in the item detail. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center text-xs font-medium text-muted-foreground">
        {title}
        {aside && <span className="ml-auto font-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A quiet button that opens a one-choice menu, for status, priority and assignee. */
export function Chip({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-xs" aria-label={label}>
          {children}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
              {option.hint && <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the Factory is doing with this item, and the brief its task was given. */
export function FactorySection({
  project,
  item,
  entry,
  factory,
}: {
  project: string;
  item: BacklogItem;
  entry: RunnerEntry;
  factory: Factory;
}) {
  const [brief, setBrief] = useState<string | null>(null);
  const hold = waitLabel(entry.wait) ?? waitLabel(factory.status?.hold);

  async function act(work: Promise<unknown>, done: string) {
    try {
      await work;
      toast.success(done);
      factory.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the queue");
    }
  }

  return (
    <Section title="Factory" aside={factoryLabel(entry)}>
      {entry.state === "queued" && (
        <>
          <p className="text-xs text-muted-foreground">{hold ? `Waiting: ${hold}.` : "Next in line."}</p>
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => void act(daemon.runnerStartNow(project, entry.taskId), "Started the task")}
              title="Starts past slots, open PRs, the daily cap, disk and headroom; never past a signed-out or exhausted account"
            >
              Start now
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void act(daemon.runnerDequeue(project, entry.taskId), "Removed from the queue")}>
              Remove from queue
            </Button>
          </div>
        </>
      )}
      {entry.state === "running" && (
        <p className="text-xs text-muted-foreground">
          Running. It commits and opens a draft PR when the workflow succeeds{entry.deliver ? "" : " — this one opens none"}.
        </p>
      )}
      {entry.state === "delivering" && <p className="text-xs text-muted-foreground">Opening a pull request…</p>}
      {entry.state === "delivered" && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            Delivered{entry.prNumber ? ` as draft PR #${entry.prNumber}` : ""}. Merging it marks this item done; closing it sends the
            item back to To do.
          </span>
          {entry.prUrl && (
            <Button size="xs" variant="outline" onClick={() => void openExternalLink(entry.prUrl ?? "")}>
              Open pull request
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => void act(daemon.runnerRetry(project, entry.taskId), "Queued another run")}>
            Run again
          </Button>
        </div>
      )}
      <Collapsible
        onOpenChange={(open) => {
          if (!open || brief !== null) return;
          void daemon
            .runnerBrief(project, item.id)
            .then(setBrief)
            .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not load the brief"));
        }}
      >
        <CollapsibleTrigger asChild>
          <Button size="xs" variant="ghost" className="-ml-2 text-xs text-muted-foreground">
            Brief the agent gets
            <ChevronDownIcon />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
            {brief ?? "Loading…"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </Section>
  );
}

/** The task this item started, and a way to open it. */
export function TaskSection({ task, onOpenTask }: { task: LinkedTask; onOpenTask: (id: string) => void }) {
  return (
    <Section title="Task">
      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline"
      >
        <StatusMark status={task.status} />
        <span className="truncate text-muted-foreground">{task.title}</span>
      </button>
    </Section>
  );
}
