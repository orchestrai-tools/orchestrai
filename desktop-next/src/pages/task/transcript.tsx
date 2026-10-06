import { deriveTranscriptRows, hasReconnectingTransient } from "@warpforge/core/sessionStream";
import type { SessionUpdate } from "@warpforge/protocol";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@warpforge/ui/components/message-scroller";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { LoaderCircleIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { activeThinkingIndex } from "../../lib/thinking";
import { ActivityLine } from "./tool-line";
import { TranscriptRow } from "./transcript-row";

function currentPermission(updates: SessionUpdate[]): string | null {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update.kind === "tool_call" && update.pendingPermission)
      return update.pendingPermission.request_id;
  }
  return null;
}

/**
 * The conversation as a reading surface: agent turns render as markdown,
 * runs of tool calls fold into one line, and your messages are set apart by
 * weight. It follows new output until you scroll up.
 */
export function Transcript({
  updates,
  project,
  agents,
  known,
  loading,
  running,
  thinking,
  onContinue,
  header,
  emptyHint = "No messages yet.",
}: {
  updates: SessionUpdate[];
  project: string;
  agents: { id: string; displayName: string }[];
  known: ReadonlySet<string>;
  loading: boolean;
  running: boolean;
  thinking: boolean;
  onContinue: (agent: string, through: number) => void;
  header?: ReactNode;
  emptyHint?: string;
}) {
  const [groupOpen, setGroupOpen] = useState<Map<string, boolean>>(new Map());
  const thinkingAt = activeThinkingIndex(updates, thinking);
  const rows = deriveTranscriptRows(
    updates,
    groupOpen,
    thinkingAt,
    null,
    running,
    currentPermission(updates),
  );

  function toggle(groupId: string, open: boolean) {
    setGroupOpen((current) => new Map(current).set(groupId, open));
  }

  function row(item: SessionUpdate, index: number, streamingThought: boolean, key?: string) {
    return (
      <TranscriptRow
        key={key}
        item={item}
        index={index}
        project={project}
        agents={agents}
        known={known}
        streamingThought={streamingThought}
        onContinue={onContinue}
      />
    );
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label="Conversation">
          <MessageScrollerContent className="w-full gap-4 px-6 py-5">
            {header && <div className="flex flex-col gap-5 pb-1">{header}</div>}
            {loading ? (
              <div aria-busy="true" className="flex flex-col gap-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{emptyHint}</p>
            ) : (
              rows.map((item) => (
                <MessageScrollerItem
                  key={item.id}
                  messageId={item.id}
                  scrollAnchor={item.kind === "update" && item.entry.update.kind === "user_message"}
                >
                  {item.kind === "activity" ? (
                    <ActivityLine row={item} onToggle={toggle}>
                      {item.items.map((step) =>
                        row(
                          step.entry.update,
                          step.entry.mergedIndex,
                          step.entry.mergedIndex === thinkingAt,
                          step.key,
                        ),
                      )}
                    </ActivityLine>
                  ) : (
                    row(item.entry.update, item.entry.mergedIndex, item.thinkingActive)
                  )}
                </MessageScrollerItem>
              ))
            )}
            {running && (
              <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
                Working…
              </p>
            )}
            {hasReconnectingTransient(updates) && (
              <p className="px-2 text-xs text-muted-foreground">
                Reconnecting to the saved agent session…
              </p>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Jump to the latest message" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
