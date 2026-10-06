import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Input } from "@warpforge/ui/components/input";
import { useId, useState, type ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Exactly what will be lost or changed, one entry per line. */
  items?: string[];
  /** Set when the action is refused: the dialog says why and offers no way to go ahead. */
  refusal?: ReactNode;
  /** The person types this to confirm, so a stray click cannot delete anything. */
  typed?: string;
  confirmLabel: string;
  /** Most confirmations guard a destructive action; a weighty but safe one uses `default`. */
  tone?: "destructive" | "default";
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

/**
 * The one confirmation every risky action goes through, on every page: it
 * names what it touches before it runs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  refusal,
  typed,
  confirmLabel,
  tone = "destructive",
  busy = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [text, setText] = useState("");
  const id = useId();
  const ready = !busy && (!typed || text.trim() === typed);
  const close = () => {
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {items && items.length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
            {items.map((item) => (
              <li key={item} className="truncate py-0.5" title={item}>
                {item}
              </li>
            ))}
          </ul>
        )}
        {refusal && <p className="text-sm text-red-600 dark:text-red-400">{refusal}</p>}
        {typed && !refusal && (
          <label htmlFor={id} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span>
              Type <span className="font-mono text-foreground">{typed}</span> to confirm
            </span>
            <Input
              id={id}
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoComplete="off"
              className="font-mono"
            />
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {refusal ? "Close" : "Cancel"}
          </Button>
          {!refusal && (
            <Button
              variant={tone}
              disabled={!ready}
              onClick={() => {
                onConfirm();
                close();
              }}
            >
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A confirmation described as data, for pages that queue one request at a time. */
export interface ConfirmRequest {
  title: string;
  description: ReactNode;
  items?: string[];
  confirmLabel: string;
  destructive?: boolean;
  refusal?: ReactNode;
  typed?: string;
  onConfirm: () => void;
}

export function ConfirmRequestDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => !open && onClose()}
      title={request?.title ?? ""}
      description={request?.description}
      items={request?.items}
      refusal={request?.refusal}
      typed={request?.typed}
      confirmLabel={request?.confirmLabel ?? ""}
      tone={request?.destructive ? "destructive" : "default"}
      onConfirm={() => request?.onConfirm()}
    />
  );
}
