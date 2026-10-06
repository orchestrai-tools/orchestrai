import { daemon } from "@warpforge/daemon";
import type { PromptAttachmentSummary, QueuedPrompt } from "@warpforge/protocol";
import { Badge } from "@warpforge/ui/components/badge";
import { Button } from "@warpforge/ui/components/button";
import { Textarea } from "@warpforge/ui/components/textarea";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function queueHeading(count: number): string {
  return count === 1
    ? "1 message waiting for the agent"
    : `${count} messages waiting for the agent`;
}

export function queueSendLabel(count: number): string {
  return count === 1 ? "Send now" : "Send all now";
}

export function queueInitiator(initiator: QueuedPrompt["initiator"]): string | null {
  if (initiator === "automation") return "Scheduled run";
  if (initiator === "system") return "OrchestrAI";
  return null;
}

function attachmentLabel(attachment: PromptAttachmentSummary): string {
  return attachment.type === "file" ? attachment.path : attachment.name;
}

function failure(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.includes("already sent")) return "Already sent";
  return error instanceof Error ? error.message : fallback;
}

/** Messages sent mid-turn wait here, in order, until the agent takes them or you hurry them along. */
export function QueuedPrompts({ taskId, queued }: { taskId: string; queued: QueuedPrompt[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (editing && !queued.some((message) => message.id === editing)) setEditing(null);
  }, [editing, queued]);

  if (queued.length === 0) return null;

  async function sendNow() {
    setSending(true);
    try {
      await daemon.request("session.interrupt", { task_id: taskId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the waiting messages");
    } finally {
      setSending(false);
    }
  }

  async function remove(message: QueuedPrompt) {
    try {
      await daemon.request("session.removeQueued", { task_id: taskId, queued_id: message.id });
      toast.success("Queued message removed");
    } catch (error) {
      toast.error(failure(error, "Could not remove the message"));
    }
  }

  async function save(message: QueuedPrompt) {
    try {
      await daemon.request("session.editQueued", {
        task_id: taskId,
        queued_id: message.id,
        text: draft,
      });
      setEditing(null);
    } catch (error) {
      toast.error(failure(error, "Could not edit the message"));
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{queueHeading(queued.length)}</p>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={sending}
          onClick={() => void sendNow()}
        >
          {queueSendLabel(queued.length)}
        </Button>
      </div>
      <ol className="flex flex-col gap-1.5">
        {queued.map((message) => {
          const source = queueInitiator(message.initiator);
          return (
            <li key={message.id} className="group/queued flex flex-col gap-1 text-sm">
              {editing === message.id ? (
                <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(message);
                  }}
                >
                  <Textarea
                    autoFocus
                    aria-label="Edit queued message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditing(null);
                      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void save(message);
                      }
                    }}
                    className="max-h-40 min-h-12 bg-background"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="xs">
                      Save
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-2">
                  {source && <Badge variant="secondary">{source}</Badge>}
                  <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap">{message.text}</p>
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/queued:opacity-100 focus-within:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Edit queued message"
                      onClick={() => {
                        setEditing(message.id);
                        setDraft(message.text);
                      }}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Remove queued message"
                      onClick={() => void remove(message)}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                </div>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {message.attachments.map(attachmentLabel).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
