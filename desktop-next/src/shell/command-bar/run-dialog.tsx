import type { RunParam } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { Input } from "@warpforge/ui/components/input";
import { useEffect, useState } from "react";
import { commandLine, missingValue, runPlace } from "./model";
import { useCommandRun } from "./run-store";

function hint(param: RunParam): string {
  switch (param.kind) {
    case "required":
      return "Required.";
    case "optional":
      return param.default ? `Optional. Default: ${param.default}` : "Optional.";
    case "plus":
      return "One or more values, separated by spaces. Quote a value that has spaces.";
    case "star":
      return "Any number of values, separated by spaces. Quote a value that has spaces.";
  }
}

/** Fills in a recipe's parameters and confirms it when the justfile asks to, then runs it. */
export function RunDialog() {
  const pending = useCommandRun((state) => state.pending);
  const cancel = useCommandRun((state) => state.cancel);
  const execute = useCommandRun((state) => state.execute);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = pending?.command.params ?? [];
    setValues(Object.fromEntries(params.map((p) => [p.name, p.default ?? ""])));
  }, [pending]);

  if (!pending) return null;
  const { command, flipped } = pending;
  const params = command.params ?? [];
  const line = commandLine(command, values);
  const missing = missingValue(params, values);
  const place = runPlace(command, flipped);
  const confirm = command.confirm != null;
  const run = (where: typeof place) => {
    if (!missing) void execute(line, where);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{command.command}</DialogTitle>
          <DialogDescription>
            {confirm && command.confirm
              ? command.confirm
              : confirm
                ? "This recipe asks to be confirmed before it runs."
                : (command.description ?? "Fill in the parameters to run it.")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(place);
          }}
        >
          {params.length > 0 && (
            <FieldGroup className="gap-3">
              {params.map((param, index) => (
                <Field key={param.name} className="gap-1">
                  <FieldLabel htmlFor={`param-${param.name}`} className="font-mono text-xs">
                    {param.kind === "plus" ? "+" : param.kind === "star" ? "*" : ""}
                    {param.name}
                  </FieldLabel>
                  <Input
                    id={`param-${param.name}`}
                    autoFocus={index === 0}
                    value={values[param.name] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [param.name]: event.target.value }))
                    }
                    className="h-8 font-mono text-xs"
                  />
                  <FieldDescription className="text-xs">{hint(param)}</FieldDescription>
                </Field>
              ))}
            </FieldGroup>
          )}
          <pre className="mt-4 overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap">
            $ {line}
          </pre>
          {missing && <p className="mt-2 text-xs text-destructive">{missing}</p>}
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(missing)}
              onClick={() => run(place === "terminal" ? "here" : "terminal")}
            >
              {place === "terminal" ? "Run here" : "Run in terminal"}
            </Button>
            <Button type="submit" disabled={Boolean(missing)} autoFocus={params.length === 0}>
              {confirm ? "Confirm and run" : "Run"}
              {place === "terminal" ? " in terminal" : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
