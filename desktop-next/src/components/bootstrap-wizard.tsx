import { daemon } from "@warpforge/daemon";
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
import { Textarea } from "@warpforge/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useState } from "react";
import { toast } from "sonner";
import { useDaemon } from "../lib/use-daemon";
import { useShell } from "../lib/shell-store";

const RUNTIMES = [
  { value: "local", label: "Local" },
  { value: "docker-compose", label: "Compose" },
  { value: "kubernetes", label: "Kubernetes" },
  { value: "mixed", label: "Mixed" },
] as const;

type Runtime = (typeof RUNTIMES)[number]["value"];

interface Answers {
  agent: string;
  runtimeKind: Runtime;
  composePath: string;
  k8sManifestsPath: string;
  k8sHelmFile: string;
  k8sReleaseNames: string;
  k8sNamespace: string;
  devCommands: string;
  notes: string;
}

const STEP_TITLE: Record<string, string> = {
  agent: "Which agent sets it up?",
  runtime: "How do the services run?",
  paths: "Where are the files?",
  commands: "What do you run while developing?",
  notes: "Anything else?",
};

/** A few questions about how a project runs, then an agent task that writes its workspace file. */
export function BootstrapWizard({ project, onClose }: { project: string; onClose: () => void }) {
  const agents = (useDaemon().snapshot.agents ?? []).filter((agent) => agent.enabled);
  const [step, setStep] = useState(0);
  const [starting, setStarting] = useState(false);
  const [answers, setAnswers] = useState<Answers>({
    agent: agents[0]?.id ?? "claude",
    runtimeKind: "local",
    composePath: "",
    k8sManifestsPath: "",
    k8sHelmFile: "",
    k8sReleaseNames: "",
    k8sNamespace: "",
    devCommands: "",
    notes: "",
  });
  const set = (patch: Partial<Answers>) => setAnswers((current) => ({ ...current, ...patch }));

  const steps = [
    ...(agents.length === 1 ? [] : ["agent"]),
    "runtime",
    ...(answers.runtimeKind === "local" ? [] : ["paths"]),
    "commands",
    "notes",
  ];
  const index = Math.min(step, steps.length - 1);
  const current = steps[index];
  const last = index >= steps.length - 1;
  const compose = answers.runtimeKind === "docker-compose" || answers.runtimeKind === "mixed";
  const k8s = answers.runtimeKind === "kubernetes" || answers.runtimeKind === "mixed";

  async function start() {
    setStarting(true);
    try {
      const result = (await daemon.request("bootstrap.start", { project, answers })) as {
        taskId?: string;
      };
      if (!result.taskId) throw new Error("The daemon did not start a setup task");
      useShell.getState().openTask(result.taskId, project);
      toast.success("Setup started");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start setup");
      setStarting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !starting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (last) void start();
            else setStep(index + 1);
          }}
        >
          <DialogHeader>
            <DialogTitle>Set up {project}</DialogTitle>
            <DialogDescription>
              Step {index + 1} of {steps.length}: {STEP_TITLE[current]}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            {current === "agent" && (
              <Field>
                <FieldLabel>Agent</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={answers.agent}
                  onValueChange={(next) => next && set({ agent: next })}
                  className="w-full"
                >
                  {(agents.length ? agents : [{ id: "claude", displayName: "Claude" }]).map(
                    (agent) => (
                      <ToggleGroupItem key={agent.id} value={agent.id} className="flex-1">
                        {agent.displayName}
                      </ToggleGroupItem>
                    ),
                  )}
                </ToggleGroup>
              </Field>
            )}
            {current === "runtime" && (
              <Field>
                <FieldLabel>Services run with</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={answers.runtimeKind}
                  onValueChange={(next) => next && set({ runtimeKind: next as Runtime })}
                  aria-label="How services run"
                  className="w-full"
                >
                  {RUNTIMES.map((runtime) => (
                    <ToggleGroupItem key={runtime.value} value={runtime.value} className="flex-1">
                      {runtime.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
            {current === "paths" && (
              <>
                {compose && (
                  <PathField
                    label="Compose file"
                    placeholder="docker-compose.yml"
                    value={answers.composePath}
                    onChange={(composePath) => set({ composePath })}
                  />
                )}
                {k8s && (
                  <>
                    <PathField
                      label="Manifests directory"
                      placeholder="k8s/"
                      value={answers.k8sManifestsPath}
                      onChange={(k8sManifestsPath) => set({ k8sManifestsPath })}
                    />
                    <PathField
                      label="Helm file"
                      placeholder="helmfile.yaml"
                      value={answers.k8sHelmFile}
                      onChange={(k8sHelmFile) => set({ k8sHelmFile })}
                    />
                    <PathField
                      label="Release names"
                      placeholder="api, web"
                      value={answers.k8sReleaseNames}
                      onChange={(k8sReleaseNames) => set({ k8sReleaseNames })}
                    />
                    <PathField
                      label="Namespace"
                      placeholder="dev"
                      value={answers.k8sNamespace}
                      onChange={(k8sNamespace) => set({ k8sNamespace })}
                    />
                  </>
                )}
              </>
            )}
            {current === "commands" && (
              <Field>
                <FieldLabel>Commands</FieldLabel>
                <Textarea
                  autoFocus
                  rows={4}
                  placeholder="bun run dev"
                  value={answers.devCommands}
                  onChange={(event) => set({ devCommands: event.target.value })}
                  className="font-mono text-xs"
                />
                <FieldDescription>One per line, the way you run them by hand.</FieldDescription>
              </Field>
            )}
            {current === "notes" && (
              <Field>
                <FieldLabel>Notes for the agent</FieldLabel>
                <Textarea
                  autoFocus
                  rows={4}
                  placeholder="Anything the setup should know"
                  value={answers.notes}
                  onChange={(event) => set({ notes: event.target.value })}
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={starting}>
              Cancel
            </Button>
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(index - 1)}
                disabled={starting}
              >
                Back
              </Button>
            )}
            <Button type="submit" disabled={starting}>
              {last ? (starting ? "Starting…" : "Start setup") : "Next"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PathField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="font-mono text-xs md:text-xs"
      />
    </Field>
  );
}
