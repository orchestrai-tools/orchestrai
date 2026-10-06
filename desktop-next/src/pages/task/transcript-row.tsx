import type { PromptAttachmentSummary, SessionUpdate } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@warpforge/ui/components/collapsible";
import { Message, MessageContent, MessageHeader } from "@warpforge/ui/components/message";
import { cn } from "@warpforge/ui/lib/utils";
import {
  BrainIcon,
  ChevronRightIcon,
  MousePointerClickIcon,
  PaperclipIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Markdown } from "../../components/markdown";
import { splitAnnotations, type ParsedAnnotation } from "../../lib/annotation";
import { useShell } from "../../lib/shell-store";
import { MessageActions } from "./message-actions";
import { PlanList } from "./plan-pane";
import { FileEditLine, ToolLine } from "./tool-line";

type Agents = { id: string; displayName: string }[];

function openFile(path: string, line: number) {
  useShell.getState().setFileJump({ path, line });
}

function Prose({ text, known }: { text: string; known: ReadonlySet<string> }) {
  return (
    <Markdown known={known} onOpenFile={openFile}>
      {text}
    </Markdown>
  );
}

/** One recorded update of the session, drawn the way it reads best. */
export function TranscriptRow({
  item,
  index,
  project,
  agents,
  known,
  streamingThought,
  onContinue,
}: {
  item: SessionUpdate;
  index: number;
  project: string;
  agents: Agents;
  known: ReadonlySet<string>;
  streamingThought: boolean;
  onContinue: (agent: string, through: number) => void;
}) {
  switch (item.kind) {
    case "user_message":
      return (
        <Message className="flex-col pt-2">
          <MessageContent className="font-medium">
            <UserText text={item.text} attachments={item.attachments} known={known} />
          </MessageContent>
          <MessageActions
            text={item.text}
            agents={agents}
            onContinue={(agent) => onContinue(agent, index)}
          />
        </Message>
      );
    case "agent_text":
      return (
        <Message className="flex-col">
          <MessageContent>
            <Prose text={item.text} known={known} />
          </MessageContent>
          <MessageActions
            text={item.text}
            agents={agents}
            onContinue={(agent) => onContinue(agent, index)}
          />
        </Message>
      );
    case "agent_thought":
      return (
        <ThinkingBlock streaming={streamingThought}>
          <Prose text={item.text} known={known} />
        </ThinkingBlock>
      );
    case "tool_call":
      return <ToolLine item={item} />;
    case "file_edit":
      return <FileEditLine item={item} />;
    case "advisor_consultation":
      return (
        <section className="flex flex-col gap-2 rounded-md border-l-2 border-l-sky-500 bg-muted/50 px-4 py-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <SparklesIcon aria-hidden className="size-3.5" />
            {item.outcome === "failed" ? `${item.agent} could not answer` : `Asked ${item.agent}`}
          </p>
          <p className="font-medium">{item.question}</p>
          <Prose text={item.answer} known={known} />
          <Button
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => useShell.getState().openTask(item.advisor_task_id, project)}
          >
            Open the advisor task
          </Button>
        </section>
      );
    case "plan":
      return (
        <section className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Plan</p>
          <PlanList entries={item.entries} />
        </section>
      );
    case "workflow_event":
      return (
        <p
          className={cn(
            "rounded-sm px-2 py-1 text-xs text-muted-foreground",
            item.tone === "error" && "bg-red-500/10 text-foreground",
            item.tone === "warning" && "bg-amber-500/10 text-foreground",
            item.tone === "success" && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          <span className="font-medium">{item.title}</span>
          {item.detail ? ` · ${item.detail}` : ""}
        </p>
      );
    case "permission_request":
      return <p className="px-2 py-1 text-xs text-muted-foreground">{item.title}</p>;
    case "turn_ended":
      return (
        <p className="px-2 text-[11px] text-muted-foreground">Turn ended · {item.stop_reason}</p>
      );
    default:
      return null;
  }
}

/** Reasoning stays open while it is arriving, then folds away. */
function ThinkingBlock({ streaming, children }: { streaming: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(streaming);
  const wasStreaming = useRef(streaming);

  useEffect(() => {
    if (streaming !== wasStreaming.current) setOpen(streaming);
    wasStreaming.current = streaming;
  }, [streaming]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} aria-label="Agent thinking">
      <CollapsibleTrigger className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60">
        <ChevronRightIcon
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        <BrainIcon aria-hidden className="size-3.5" />
        {streaming ? "Thinking…" : "Thought"}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-3.5 border-l pl-3 text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function UserText({
  text,
  attachments,
  known,
}: {
  text: string;
  attachments?: PromptAttachmentSummary[];
  known: ReadonlySet<string>;
}) {
  const parts = text.includes("<browser_annotation>") ? splitAnnotations(text) : null;
  return (
    <>
      {parts ? (
        parts.map((part, index) =>
          part.kind === "annotation" ? (
            <AnnotationCard key={index} annotation={part.value} />
          ) : (
            part.value.trim() && <Prose key={index} text={part.value} known={known} />
          ),
        )
      ) : (
        <Prose text={text} known={known} />
      )}
      {attachments && attachments.length > 0 && (
        <MessageHeader className="flex-wrap gap-1.5 px-0 font-normal">
          <PaperclipIcon aria-hidden className="size-3" />
          {attachments.map((item) => (item.type === "file" ? item.path : item.name)).join(", ")}
        </MessageHeader>
      )}
    </>
  );
}

/** The element someone pointed at in the in-app browser. */
function AnnotationCard({ annotation }: { annotation: ParsedAnnotation }) {
  let host = "";
  try {
    if (annotation.url) host = new URL(annotation.url).host;
  } catch {
    host = "";
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 text-xs font-normal">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <MousePointerClickIcon aria-hidden className="size-3.5" />
        Pointed at {annotation.role || "an element"} in the browser
        {host ? ` · ${host}` : ""}
      </p>
      {annotation.text && <p>{annotation.text}</p>}
      {annotation.selector && (
        <p className="truncate font-mono text-muted-foreground">{annotation.selector}</p>
      )}
    </div>
  );
}
