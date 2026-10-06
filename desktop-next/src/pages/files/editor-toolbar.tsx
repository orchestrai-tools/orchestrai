import { Button } from "@warpforge/ui/components/button";
import { Separator } from "@warpforge/ui/components/separator";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PencilLineIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Actions on the open file. Icon buttons carry their label as hidden text
 * because the command palette clicks them by that text.
 */
export function EditorToolbar({
  path,
  dirty,
  saved,
  previewable,
  preview,
  changes,
  changeAt,
  onPreview,
  onStep,
  onRevertAll,
  onAsk,
  onRename,
  onDelete,
}: {
  path: string;
  dirty: boolean;
  saved: boolean;
  previewable: boolean;
  preview: boolean;
  changes: number;
  changeAt: number;
  onPreview: () => void;
  onStep: (delta: number) => void;
  onRevertAll: () => void;
  onAsk: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={path}>
        {path}
      </span>
      {dirty && <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Unsaved</span>}
      {saved && !dirty && <span className="shrink-0 text-xs text-muted-foreground">Saved</span>}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {changes > 0 && (
          <>
            <IconAction label="Previous change" onClick={() => onStep(-1)}>
              <ChevronUpIcon />
            </IconAction>
            <span className="min-w-12 text-center text-xs text-muted-foreground tabular-nums">
              {changeAt >= 0 ? `${changeAt + 1} of ${changes}` : `${changes} changed`}
            </span>
            <IconAction label="Next change" onClick={() => onStep(1)}>
              <ChevronDownIcon />
            </IconAction>
            <IconAction label="Revert to last commit" onClick={onRevertAll}>
              <RotateCcwIcon />
            </IconAction>
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>
        )}
        {previewable && (
          <Button type="button" variant="ghost" size="xs" aria-pressed={preview} onClick={onPreview}>
            {preview ? <PencilIcon /> : <EyeIcon />}
            {preview ? "Edit" : "Preview"}
          </Button>
        )}
        <IconAction label="Add selection to chat" onClick={onAsk}>
          <MessageSquarePlusIcon />
        </IconAction>
        <IconAction label="Rename…" onClick={onRename}>
          <PencilLineIcon />
        </IconAction>
        <IconAction label="Delete…" onClick={onDelete}>
          <Trash2Icon />
        </IconAction>
        <Button type="submit" size="xs" disabled={!dirty} className="ml-1">
          Save
        </Button>
      </div>
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" title={label} onClick={onClick}>
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
