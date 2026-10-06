import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { useId, useState } from "react";
import { folderNameFromPath, normalizePortRange, portRangeInputError } from "../lib/port-range";
import { useShell } from "../lib/shell-store";

/** Adds a folder from disk as a project: path, name, and an optional port range. */
export function AddFolderForm({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: (name: string) => void;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [ports, setPorts] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pathId = useId();
  const nameId = useId();
  const portsId = useId();

  function applyPath(next: string) {
    setPath(next);
    if (!nameEdited) setName(folderNameFromPath(next));
  }

  async function browse() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select project folder",
      });
      if (typeof selected === "string") applyPath(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the folder picker");
    }
  }

  async function submit() {
    setError(null);
    const invalid = ports.trim() ? portRangeInputError(ports) : null;
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const result = await daemon.addProject(
        path.trim(),
        name.trim() || undefined,
        ports.trim() ? (normalizePortRange(ports) ?? undefined) : undefined,
      );
      const projectName = result.name ?? name.trim();
      if (projectName) useShell.getState().openProject(projectName);
      if (projectName) onAdded(projectName);
      else onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a folder</DialogTitle>
        <DialogDescription>
          A repository on disk becomes a project. Its files are not changed.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={pathId}>Folder</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={pathId}
              autoFocus
              placeholder="/path/to/repo"
              value={path}
              onChange={(event) => applyPath(event.target.value)}
              className="font-mono text-xs md:text-xs"
            />
            <Button type="button" variant="outline" onClick={() => void browse()}>
              Browse…
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            id={nameId}
            placeholder="Name"
            value={name}
            onChange={(event) => {
              setNameEdited(true);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={portsId}>Port range</FieldLabel>
          <Input
            id={portsId}
            placeholder="4300-4399"
            value={ports}
            onChange={(event) => setPorts(event.target.value)}
            aria-invalid={error !== null && Boolean(ports.trim() && portRangeInputError(ports))}
            className="font-mono text-xs md:text-xs"
          />
          <FieldDescription>
            Optional. Left empty, a free block of 100 ports is picked.
          </FieldDescription>
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!path.trim() || busy}>
          {busy ? "Adding…" : "Add project"}
        </Button>
      </DialogFooter>
    </form>
  );
}
