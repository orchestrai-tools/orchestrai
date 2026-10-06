import type { CommandInfo, ProjectFile, PromptAttachment } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { FileIcon, FileDiffIcon, ImageIcon, StickyNoteIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useComposerChips } from "../../lib/composer-chips";

/** The pop-up list over the composer: slash commands or matching files, with the keyboard row marked. */
function Popup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-64 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {children}
    </div>
  );
}

function PopupRow({
  active,
  onPick,
  children,
}: {
  active: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left",
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function CommandMenu({
  commands,
  active,
  onPick,
}: {
  commands: CommandInfo[];
  active: number;
  onPick: (command: CommandInfo) => void;
}) {
  return (
    <Popup label="Agent commands">
      {commands.map((command, index) => (
        <PopupRow key={command.name} active={index === active} onPick={() => onPick(command)}>
          <span className="shrink-0 font-mono text-xs">/{command.name}</span>
          {command.description && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {command.description}
            </span>
          )}
        </PopupRow>
      ))}
    </Popup>
  );
}

export function MentionMenu({
  files,
  active,
  loading,
  error,
  onPick,
}: {
  files: ProjectFile[];
  active: number;
  loading: boolean;
  error: string | null;
  onPick: (path: string) => void;
}) {
  const note = loading
    ? "Loading files…"
    : error
      ? error
      : files.length === 0
        ? "No matching files"
        : null;
  return (
    <Popup label="Files">
      {note ? (
        <p
          className={cn(
            "px-2 py-1.5 text-xs text-muted-foreground",
            error && !loading && "text-destructive",
          )}
        >
          {note}
        </p>
      ) : (
        files.map((file, index) => (
          <PopupRow key={file.path} active={index === active} onPick={() => onPick(file.path)}>
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-mono text-xs">{file.path}</span>
            {file.changed && (
              <span className="ml-auto shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">
                changed
              </span>
            )}
          </PopupRow>
        ))
      )}
    </Popup>
  );
}

function Chip({
  icon,
  label,
  onRemove,
  children,
}: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="flex h-6 max-w-64 items-center gap-1 rounded-sm border bg-muted/50 pr-0.5 pl-1.5 text-xs">
      {icon}
      <span className="min-w-0 truncate">{children ?? label}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-5"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}

/** Diffs, notes, and files waiting to go out with the next message. */
export function ComposerChips({
  attachments,
  onRemoveAttachment,
}: {
  attachments: PromptAttachment[];
  onRemoveAttachment: (index: number) => void;
}) {
  const diffs = useComposerChips((state) => state.diffs);
  const contexts = useComposerChips((state) => state.contexts);
  const remove = useComposerChips((state) => state.remove);
  if (diffs.length === 0 && contexts.length === 0 && attachments.length === 0) return null;
  const icon = "size-3.5 shrink-0 text-muted-foreground";
  return (
    <ul className="flex flex-wrap gap-1.5 px-2 pt-2" aria-label="Attached to the next message">
      {diffs.map((chip) => (
        <Chip
          key={chip.id}
          icon={<FileDiffIcon aria-hidden className={icon} />}
          label={chip.path}
          onRemove={() => remove(chip.id)}
        >
          <span className="font-mono">{chip.path}</span>{" "}
          <span className="text-emerald-600 dark:text-emerald-400">+{chip.added}</span>{" "}
          <span className="text-red-600 dark:text-red-400">−{chip.removed}</span>
        </Chip>
      ))}
      {contexts.map((chip) => (
        <Chip
          key={chip.id}
          icon={
            chip.image ? (
              <img
                alt=""
                src={`data:image/png;base64,${chip.image.data}`}
                className="size-4 shrink-0 rounded-[2px] object-cover"
              />
            ) : (
              <StickyNoteIcon aria-hidden className={icon} />
            )
          }
          label={chip.label}
          onRemove={() => remove(chip.id)}
        />
      ))}
      {attachments.map((item, index) => {
        const label = item.type === "file" ? item.path : item.name;
        return (
          <Chip
            key={`${label}:${index}`}
            icon={
              item.type === "image" ? (
                <ImageIcon aria-hidden className={icon} />
              ) : (
                <FileIcon aria-hidden className={icon} />
              )
            }
            label={label}
            onRemove={() => onRemoveAttachment(index)}
          />
        );
      })}
    </ul>
  );
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** PNG and JPEG go as images; anything else is read as a text document. */
export async function attachmentFromFile(file: File): Promise<PromptAttachment> {
  if (file.type === "image/png" || file.type === "image/jpeg") {
    return { type: "image", name: file.name, mimeType: file.type, data: await readBase64(file) };
  }
  return {
    type: "document",
    name: file.name,
    mimeType: file.type || "text/plain",
    text: await file.text(),
  };
}
