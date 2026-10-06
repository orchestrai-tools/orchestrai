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
import { useEffect, useState } from "react";

/** What the name dialog is naming: a new file or folder under `path`, or a rename of `path`. */
export interface NameRequest {
  kind: "file" | "folder" | "rename";
  path: string;
}

/** The folder a new entry next to `path` goes into, with a trailing slash. */
export function folderOf(path: string, directory: boolean): string {
  if (directory) return path ? `${path.replace(/\/$/, "")}/` : "";
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash + 1);
}

const COPY = {
  file: { title: "New file", action: "Create", busy: "Creating…" },
  folder: { title: "New folder", action: "Create", busy: "Creating…" },
  rename: { title: "Rename", action: "Rename", busy: "Renaming…" },
} as const;

/** Asks for a project-relative path to create, or the new path of a rename. */
export function NameDialog({
  request,
  onClose,
  onSubmit,
}: {
  request: NameRequest | null;
  onClose: () => void;
  onSubmit: (request: NameRequest, path: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(request?.path ?? ""), [request]);
  if (!request) return null;
  const copy = COPY[request.kind];
  const next = value.trim().replace(/\/$/, "");
  const unchanged = request.kind === "rename" ? next === request.path : next === request.path.replace(/\/$/, "");

  async function submit() {
    if (!request || !next || unchanged || busy) return;
    setBusy(true);
    try {
      if (await onSubmit(request, next)) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.kind === "rename" ? `Rename ${request.path}` : copy.title}</DialogTitle>
            <DialogDescription>
              {request.kind === "rename"
                ? "Give the new path from the project root."
                : "The path is relative to the project root."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.currentTarget.setSelectionRange(value.length, value.length)}
            aria-label={request.kind === "rename" ? "New path" : "Path"}
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !next || unchanged}>
              {busy ? copy.busy : copy.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
