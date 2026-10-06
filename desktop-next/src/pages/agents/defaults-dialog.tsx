import type { AgentConfig } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@warpforge/ui/components/field";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { useState } from "react";
import { modelChoices } from "../../lib/new-task";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { saveAgents } from "./agents-store";

const INHERIT = "inherit";

function Choice({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        value={value}
        onValueChange={(next) => next && onChange(next)}
        className="flex-wrap justify-start"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="h-7 px-2 text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

function AgentForm({
  agent,
  configured,
  onDone,
}: {
  agent: AgentConfig;
  configured: AgentConfig[];
  onDone: () => void;
}) {
  const writesGitText = useShell((state) => state.textGenAgentId === agent.id);
  const [model, setModel] = useState(agent.lastModel ?? INHERIT);
  const [gitText, setGitText] = useState(writesGitText);
  const choices = modelChoices(agent.models);

  const save = () => {
    const lastModel = model === INHERIT ? undefined : model;
    void saveAgents(
      configured.map((item) => (item.id === agent.id ? { ...item, lastModel } : item)),
      "Saved defaults",
    );
    const shell = useShell.getState();
    if (gitText && !writesGitText) shell.setTextGen(agent.id, "");
    if (!gitText && writesGitText) shell.setTextGen("", "");
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Defaults for {agent.displayName}</DialogTitle>
        <DialogDescription>
          Tasks started without a model pick, including ones an orchestrator starts, use this one.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Choice
          label="Model"
          value={model}
          onChange={setModel}
          options={[
            { value: INHERIT, label: "Agent default" },
            ...choices.map((choice) => ({ value: choice.value, label: choice.name })),
          ]}
          description={
            choices.length > 0
              ? "The models this agent offers, read from it over ACP."
              : "The list fills after this agent has run once, or after Reload model list."
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={gitText} onCheckedChange={(checked) => setGitText(checked === true)} />
          Write commit messages and pull request descriptions with {agent.displayName}
        </label>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save defaults</Button>
      </DialogFooter>
    </>
  );
}

function GlobalForm({ configured, onDone }: { configured: AgentConfig[]; onDone: () => void }) {
  const [agent, setAgent] = useState(() => useShell.getState().textGenAgentId || INHERIT);
  const [model, setModel] = useState(() => useShell.getState().textGenModel || INHERIT);
  const [autoName, setAutoName] = useState(() => useShell.getState().autoNameTasks);
  const enabled = configured.filter((item) => item.enabled);
  const choices = modelChoices(enabled.find((item) => item.id === agent)?.models ?? []);

  const save = () => {
    const shell = useShell.getState();
    shell.setTextGen(agent === INHERIT ? "" : agent, model === INHERIT ? "" : model);
    shell.setAutoNameTasks(autoName);
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Global defaults</DialogTitle>
        <DialogDescription>Choices that apply across agents.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Choice
          label="Commit and pull request text"
          value={agent}
          onChange={(next) => {
            setAgent(next);
            setModel(INHERIT);
          }}
          options={[
            { value: INHERIT, label: "None" },
            ...enabled.map((item) => ({ value: item.id, label: item.displayName })),
          ]}
          description="Drafts commit messages and pull request descriptions from the diff."
        />
        {agent !== INHERIT && (
          <Choice
            label="Model for that text"
            value={model}
            onChange={setModel}
            options={[
              { value: INHERIT, label: "Agent default" },
              ...choices.map((choice) => ({ value: choice.value, label: choice.name })),
            ]}
            description={
              choices.length === 0
                ? "The model list fills after that agent has run once."
                : undefined
            }
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={autoName}
            onCheckedChange={(checked) => setAutoName(checked === true)}
          />
          Give new tasks a short title
        </label>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save defaults</Button>
      </DialogFooter>
    </>
  );
}

/** One dialog for an agent's own defaults or the global ones. */
export function DefaultsDialog({
  target,
  onOpenChange,
}: {
  target: string | "global" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const configured = useDaemon().snapshot.agents ?? [];
  const agent =
    target && target !== "global" ? configured.find((item) => item.id === target) : undefined;
  const close = () => onOpenChange(false);
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {target === "global" ? (
          <GlobalForm configured={configured} onDone={close} />
        ) : agent ? (
          <AgentForm key={agent.id} agent={agent} configured={configured} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
