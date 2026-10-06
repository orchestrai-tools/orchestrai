import { daemon } from "@warpforge/daemon";
import type { BacklogItem, RunnerEntry } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Input } from "@warpforge/ui/components/input";
import { Textarea } from "@warpforge/ui/components/textarea";
import { cn } from "@warpforge/ui/lib/utils";
import { EllipsisIcon, ExternalLinkIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { Markdown } from "../../components/markdown";
import { openExternalLink } from "../../lib/external-link";
import type { LinkedTask } from "./backlog-row";
import { Chip, FactorySection, Section, TaskSection } from "./item-sections";
import {
  ago,
  isClosed,
  PRIORITIES,
  priorityLabel,
  priorityTone,
  sourceLabel,
  statusDot,
  statusLabel,
  STATUSES,
} from "./labels";
import { TrackerImage } from "./tracker-image";
import type { Factory } from "./use-backlog";

interface Props {
  project: string;
  item: BacklogItem;
  entry?: RunnerEntry;
  task?: LinkedTask;
  assignees: string[];
  factory: Factory;
  onSaved: (item: BacklogItem) => void;
  onDeleted: () => void;
  onStart: () => void;
  onStartInFactory: () => void;
  onOpenTask: (id: string) => void;
  onConfirm: (request: ConfirmRequest) => void;
  onClose: () => void;
}

const copy = (text: string, what: string) =>
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error(`Could not copy the ${what}`),
  );

/**
 * One work item beside the list. Only a local item's words, status and
 * assignee are ours to edit: a tracker owns those for its issues, and a sync
 * would undo the edit. Priority is always ours.
 */
export function ItemDetail({
  project,
  item,
  entry,
  task,
  assignees,
  factory,
  onSaved,
  onDeleted,
  onStart,
  onStartInFactory,
  onOpenTask,
  onConfirm,
  onClose,
}: Props) {
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const local = item.source === "local";
  const closed = isClosed(item.status);
  const dirty = (title !== null && title !== item.title) || (body !== null && body !== item.body);

  async function patch(change: { title?: string; body?: string; status?: string; priority?: string; assignee?: string }) {
    try {
      onSaved(await daemon.updateBacklog({ itemId: item.id, project, ...change }));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the work item");
      return false;
    }
  }

  async function saveBody() {
    const change: { body: string; title?: string } = { body: body ?? item.body };
    if (title !== null && title.trim() && title.trim() !== item.title) change.title = title.trim();
    if (await patch(change)) {
      setBody(null);
      setTitle(null);
    }
  }

  async function enhance() {
    setEnhancing(true);
    try {
      const text = await daemon.enhancePrompt(project, "claude", `${title ?? item.title}\n\n${body ?? item.body}`);
      const [nextTitle, ...rest] = text.split("\n");
      if (nextTitle?.trim()) setTitle(nextTitle.trim());
      const nextBody = rest.join("\n").trim();
      if (nextBody) setBody(nextBody);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enhance the item");
    } finally {
      setEnhancing(false);
    }
  }

  const close = () => {
    if (!dirty) return onClose();
    onConfirm({
      title: "Discard these edits?",
      description: "Closing loses the title and description you changed.",
      confirmLabel: "Discard",
      destructive: true,
      onConfirm: onClose,
    });
  };

  const remove = () =>
    onConfirm({
      title: `Delete #${item.number}?`,
      description: `“${item.title}” leaves the backlog for good.${item.taskId ? " The task it started keeps running." : ""}`,
      items: [`#${item.number} ${item.title}`],
      confirmLabel: "Delete item",
      destructive: true,
      onConfirm: () =>
        void daemon
          .deleteBacklog(item.id, project)
          .then(() => {
            toast.success("Deleted the work item");
            onDeleted();
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not delete the item")),
    });

  return (
    <aside aria-label={`#${item.number}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="font-mono">#{item.number}</span> · {sourceLabel(item.source)} · {item.assignee || "Nobody"}
          </span>
          <div className="ml-auto flex shrink-0">
            {item.url && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Open in ${sourceLabel(item.source)}`}
                onClick={() => void openExternalLink(item.url ?? "")}
              >
                <ExternalLinkIcon />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`More for #${item.number}`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => copy(`#${item.number}`, "number")}>Copy #{item.number}</DropdownMenuItem>
                {item.url && <DropdownMenuItem onSelect={() => copy(item.url ?? "", "link")}>Copy link</DropdownMenuItem>}
                {local && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={remove}>
                      Delete item…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={close}>
              <XIcon />
            </Button>
          </div>
        </div>
        {title !== null && body === null ? (
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() && title.trim() !== item.title) void patch({ title: title.trim() });
              setTitle(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setTitle(null);
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Title"
            className="h-7 text-sm font-semibold"
          />
        ) : (
          <h2 className="text-sm leading-snug font-semibold">
            {local && body === null ? (
              <button
                type="button"
                onClick={() => setTitle(item.title)}
                className="-mx-1 rounded-sm px-1 text-left hover:bg-muted"
                title="Rename"
              >
                {item.title}
              </button>
            ) : (
              (title ?? item.title)
            )}
          </h2>
        )}
        <div className="-ml-2 flex flex-wrap items-center gap-0.5">
          {local ? (
            <Chip
              label="Status"
              value={item.status}
              options={STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
              onChange={(status) => void patch({ status })}
            >
              <span aria-hidden className={cn("size-2 rounded-full", statusDot(item.status))} />
              {statusLabel(item.status)}
            </Chip>
          ) : (
            <span
              className="flex h-6 items-center gap-1.5 px-2 text-xs"
              title={`${sourceLabel(item.source)} owns this status; OrchestrAI reads it and never writes it back`}
            >
              <span aria-hidden className={cn("size-2 rounded-full", statusDot(item.status))} />
              {item.remoteStatus || statusLabel(item.status)}
            </span>
          )}
          <Chip
            label="Priority"
            value={item.priority}
            options={PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))}
            onChange={(priority) => void patch({ priority })}
          >
            <span className={priorityTone(item.priority)}>{priorityLabel(item.priority)}</span>
          </Chip>
          {local ? (
            <Chip
              label="Assignee"
              value={item.assignee || "nobody"}
              options={[
                ...assignees.map((name) => ({ value: name, label: name })),
                { value: "nobody", label: "Nobody" },
              ]}
              onChange={(next) => void patch({ assignee: next === "nobody" ? "" : next })}
            >
              {item.assignee || "Nobody"}
            </Chip>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">{item.assignee || "Nobody"}</span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {entry && <FactorySection project={project} item={item} entry={entry} factory={factory} />}
        {task && <TaskSection task={task} onOpenTask={onOpenTask} />}
        <Section
          title="Description"
          aside={
            local && body === null ? (
              <Button variant="ghost" size="xs" onClick={() => setBody(item.body)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {body !== null ? (
            <div className="flex flex-col gap-1.5">
              {title !== null && title !== item.title && (
                <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Title" className="h-7 text-sm" />
              )}
              <Textarea
                autoFocus
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setBody(null);
                    setTitle(null);
                  }
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void saveBody();
                }}
                aria-label="Description"
                className="min-h-48 font-mono text-xs"
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  className="mr-auto text-muted-foreground"
                  disabled={enhancing}
                  onClick={() => void enhance()}
                  title="Rewrite the title and description into a clearer brief"
                >
                  <WandSparklesIcon />
                  {enhancing ? "Enhancing…" : "Enhance"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setBody(null);
                    setTitle(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="xs" onClick={() => void saveBody()}>
                  Save ⌘↵
                </Button>
              </div>
            </div>
          ) : item.body ? (
            <Markdown allowHtml={!local} image={local ? undefined : TrackerImage}>
              {item.body}
            </Markdown>
          ) : (
            <p className="text-xs text-muted-foreground">{local ? "No description yet." : "No description in the tracker."}</p>
          )}
        </Section>
      </div>

      <footer className="flex items-center gap-3 border-t px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          Created {ago(item.createdAt)} · updated {ago(item.updatedAt)}
        </span>
        <div className="ml-auto flex gap-1.5">
          {!closed && !entry && !task && (
            <Button size="xs" variant="outline" onClick={onStartInFactory} title="A workflow makes the change, commits, and opens a draft PR">
              Start in Factory…
            </Button>
          )}
          {task ? (
            <Button size="xs" onClick={() => onOpenTask(task.id)}>
              Open task
            </Button>
          ) : (
            !closed &&
            !entry && (
              <Button size="xs" onClick={onStart}>
                Start task…
              </Button>
            )
          )}
        </div>
      </footer>
    </aside>
  );
}
