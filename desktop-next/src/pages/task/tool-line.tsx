import {
  basenameOf,
  classifyToolCall,
  dominantCategory,
  toolTarget,
} from "@warpforge/core/transcriptGroups";
import type { TranscriptListRow } from "@warpforge/core/sessionStream";
import { toolDisplayTitle } from "@warpforge/core/toolDisplay";
import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, ToolCallStatus } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import {
  BrainIcon,
  ChevronRightIcon,
  FilePenIcon,
  FileTextIcon,
  LoaderCircleIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { permissionOutcome, type PermissionWire } from "../../lib/attention-notice";
import { editLine } from "../../lib/editor-nav";
import { useShell } from "../../lib/shell-store";

type ToolCall = Extract<SessionUpdate, { kind: "tool_call" }>;
type FileEdit = Extract<SessionUpdate, { kind: "file_edit" }>;
type ActivityRow = Extract<TranscriptListRow, { kind: "activity" }>;
type Category = ReturnType<typeof dominantCategory>;

const CATEGORY_ICON: Partial<Record<Category, LucideIcon>> = {
  read: FileTextIcon,
  search: SearchIcon,
  edit: FilePenIcon,
  run: TerminalIcon,
  think: BrainIcon,
};

function openFile(path: string, line = 0) {
  useShell.getState().setFileJump({ path, line });
}

export function CategoryIcon({ category }: { category: Category }) {
  const Icon = CATEGORY_ICON[category] ?? WrenchIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}

/** A running step spins. A failed step is marked. A finished step stays quiet. */
export function ToolStatusIcon({ status }: { status: ToolCallStatus }) {
  if (status === "failed")
    return <XIcon aria-label="Failed" className="size-3.5 shrink-0 text-red-500" />;
  if (status === "pending" || status === "in_progress") {
    return <LoaderCircleIcon aria-label="Working" className="size-3.5 shrink-0 animate-spin" />;
  }
  return null;
}

/** One line for a run of reads, searches, edits, and commands, which opens into the steps. */
export function ActivityLine({
  row,
  onToggle,
  children,
}: {
  row: ActivityRow;
  onToggle: (groupId: string, open: boolean) => void;
  children: ReactNode;
}) {
  if (!row.expandable) return <>{children}</>;
  const edit = row.summary.clips.find((clip) => clip.kind === "edit");
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={row.open}
        onClick={() => onToggle(row.groupId, !row.open)}
        className={cn(
          "flex items-center gap-2 rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60",
          row.hasPendingApproval && "bg-amber-500/10 text-foreground",
          row.hasFailure && "text-foreground",
        )}
      >
        <ChevronRightIcon
          aria-hidden
          className={cn("size-3.5 shrink-0 transition-transform", row.open && "rotate-90")}
        />
        <CategoryIcon category={dominantCategory(row.items)} />
        <span className="min-w-0 truncate">{row.summary.text}</span>
        {row.live && (
          <LoaderCircleIcon aria-label="Working" className="size-3.5 shrink-0 animate-spin" />
        )}
        {row.hasFailure && <XIcon aria-label="Failed" className="size-3.5 shrink-0 text-red-500" />}
        {edit?.kind === "edit" && (edit.additions != null || edit.deletions != null) && (
          <span className="ml-auto shrink-0 font-mono tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{edit.additions ?? 0}</span>{" "}
            <span className="text-red-600 dark:text-red-400">−{edit.deletions ?? 0}</span>
          </span>
        )}
      </button>
      {row.open && <div className="flex flex-col gap-1 border-l pl-3 ml-3.5">{children}</div>}
    </div>
  );
}

/** A tool call is one quiet line with its result, not a block that interrupts reading. */
export function ToolLine({ item }: { item: ToolCall }) {
  const [open, setOpen] = useState(false);
  const title = toolDisplayTitle(item);
  const category = classifyToolCall(item);
  const target = toolTarget(item);
  const chipped = (category === "read" || category === "edit") && target != null;
  const label = chipped ? (category === "read" ? "Read" : "Edit") : title;
  const outputName = chipped && target ? basenameOf(target) : title;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-sm px-2 py-1 font-mono text-xs text-muted-foreground",
          item.pendingPermission && "bg-amber-500/10 text-foreground",
          item.status === "failed" && "bg-red-500/10 text-foreground",
        )}
      >
        <CategoryIcon category={category} />
        <span className="min-w-0 truncate">{label}</span>
        {chipped && target && (
          <button
            type="button"
            title={target}
            onClick={() => openFile(target)}
            className="min-w-0 truncate underline-offset-2 hover:text-foreground hover:underline"
          >
            {basenameOf(target)}
          </button>
        )}
        <ToolStatusIcon status={item.status} />
        {item.pendingPermission && (
          <span className="ml-auto shrink-0 font-sans">Waiting for your approval</span>
        )}
        {item.content && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto font-sans text-muted-foreground"
            aria-expanded={open}
            aria-label={open ? `Hide output for ${outputName}` : `Show output for ${outputName}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide output" : "Output"}
          </Button>
        )}
      </div>
      {open && item.content && (
        <pre className="max-h-80 overflow-auto rounded-sm bg-muted/50 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {item.content}
        </pre>
      )}
    </div>
  );
}

const OUTCOME_LABEL: Record<PermissionWire, string> = {
  allow: "Approve once",
  allow_always: "Always for this task",
  deny: "Deny",
};

/** The answers an agent offered for a permission prompt; a deny sits apart from the approvals. */
export function PermissionButtons({
  taskId,
  requestId,
  options,
  className,
}: {
  taskId: string;
  requestId: string;
  options: string[];
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function answer(option: string) {
    const outcome = permissionOutcome(option);
    if (!outcome) return;
    setBusy(true);
    try {
      await daemon.request("session.permission", {
        task_id: taskId,
        request_id: requestId,
        outcome,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not answer the agent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option, index) => {
        const outcome = permissionOutcome(option);
        return (
          <Button
            key={option}
            size="sm"
            disabled={busy || !outcome}
            variant={outcome === "deny" ? "ghost" : index === 0 ? "default" : "outline"}
            className={cn(outcome === "deny" && "ml-auto text-destructive")}
            onClick={() => void answer(option)}
          >
            {outcome ? OUTCOME_LABEL[outcome] : option}
          </Button>
        );
      })}
    </div>
  );
}

/** An edit the agent made: the file opens at the change, and the hunks read as a diff. */
export function FileEditLine({ item }: { item: FileEdit }) {
  const line = editLine(item.hunks);
  const lines = item.hunks?.flatMap((hunk) => hunk.lines) ?? [];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2 px-2 py-1 font-mono text-xs text-muted-foreground">
        <FilePenIcon aria-hidden className="size-3.5 shrink-0" />
        <button
          type="button"
          title={item.path}
          onClick={() => openFile(item.path, line)}
          className="min-w-0 truncate underline-offset-2 hover:text-foreground hover:underline"
        >
          {item.path}
        </button>
        {(item.additions != null || item.deletions != null) && (
          <button
            type="button"
            aria-label={`${item.additions ?? 0} lines added, ${item.deletions ?? 0} lines deleted`}
            onClick={() => openFile(item.path, line)}
            className="ml-auto shrink-0 tabular-nums"
          >
            <span className="text-emerald-600 dark:text-emerald-400">+{item.additions ?? 0}</span>{" "}
            <span className="text-red-600 dark:text-red-400">−{item.deletions ?? 0}</span>
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <pre className="max-h-80 overflow-auto rounded-sm bg-muted/50 py-2 font-mono text-xs">
          {lines.map((text, index) => (
            <div
              key={index}
              className={cn(
                "px-3",
                text.startsWith("+") && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                text.startsWith("-") && "bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              {text || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
