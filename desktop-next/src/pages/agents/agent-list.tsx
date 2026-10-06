import type { AgentConfig, DetectedAgent } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Switch } from "@warpforge/ui/components/switch";
import { MoreHorizontalIcon } from "lucide-react";

import { VersionPill, versionState } from "../../components/common/version-pill";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { copyText } from "../services/runtime-actions";
import { agentState, modelName, otherOptions, type AgentState } from "./agent-state";
import { saveAgents, useAgentsStore, withEnabled } from "./agents-store";

function Fact({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        {value}
        {source && <span className="text-muted-foreground"> · {source}</span>}
      </dd>
    </div>
  );
}

function notesFor(
  agent: DetectedAgent,
  state: AgentState,
  probing: boolean,
  gitText: boolean,
): string[] {
  const notes: string[] = [];
  if (state === "installing")
    notes.push(`Running ${agent.installCommand ?? agent.updateCommand ?? "the install"}`);
  if (state === "missing" && agent.canManage && agent.installCommand)
    notes.push(`Install runs ${agent.installCommand}`);
  if (state === "missing" && !agent.canManage && agent.installHint)
    notes.push(`Install: ${agent.installHint}`);
  if (state === "update" && agent.latestVersion) {
    const how = agent.updateCommand ? ` Updating runs ${agent.updateCommand}.` : "";
    notes.push(`v${agent.latestVersion} is out.${how}`);
  }
  if (state === "broken" && agent.canReinstall) notes.push("Needs a reinstall to start.");
  if (probing) notes.push("Reloading the model list from the agent over ACP…");
  if (gitText) notes.push("Writes commit messages and pull request descriptions.");
  return notes;
}

function AgentRow({
  agent,
  saved,
  configured,
  onDefaults,
}: {
  agent: DetectedAgent;
  saved?: AgentConfig;
  configured: AgentConfig[];
  onDefaults: (id: string) => void;
}) {
  const busy = useAgentsStore((state) => state.busy === agent.id);
  const probing = useAgentsStore((state) => state.probing === agent.id);
  const gitText = useShell((state) => state.textGenAgentId === agent.id);
  const state = agentState(agent, busy);
  const installed = agent.installed && agent.status !== "missing";
  const broken = agent.brokenInstall;
  const pill = versionState({
    installed: agent.installed,
    status: agent.status,
    broken: Boolean(broken),
    busy,
  });
  const { install, probe } = useAgentsStore.getState();

  return (
    <li className="group/row flex items-start gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted/40">
      <Switch
        size="sm"
        className="mt-1"
        checked={installed && Boolean(saved?.enabled)}
        disabled={!installed}
        onCheckedChange={(on) => void saveAgents(withEnabled(configured, agent, on))}
        aria-label={`Offer ${agent.displayName} for new tasks`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{agent.displayName}</span>
          <VersionPill state={pill} version={agent.version} latest={agent.latestVersion} />
          <code className="font-mono text-xs text-muted-foreground">
            {saved?.acpCommand ?? agent.defaultAcpCommand}
          </code>
        </div>
        {installed && saved && (
          <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            <Fact
              label="Model"
              value={saved.lastModel ? modelName(saved.models, saved.lastModel) : "agent default"}
              source={saved.lastModel ? "last picked" : undefined}
            />
            {otherOptions(saved.models).map((option) => (
              <Fact
                key={option.id}
                label={option.name}
                value={
                  option.options.find((choice) => choice.value === option.currentValue)?.name ??
                  option.currentValue
                }
              />
            ))}
          </dl>
        )}
        {notesFor(agent, state, probing, gitText).map((text) => (
          <p key={text} className="text-xs text-muted-foreground">
            {text}
          </p>
        ))}
        {broken && (
          <p className="text-xs text-red-600 dark:text-red-400" title={broken.detail}>
            {broken.summary}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {agent.canManage && !installed && (
          <Button size="xs" disabled={busy} onClick={() => void install(agent.id, false)}>
            Install
          </Button>
        )}
        {agent.canManage && state === "update" && (
          <Button size="xs" disabled={busy} onClick={() => void install(agent.id, false)}>
            Update
          </Button>
        )}
        {broken && agent.canReinstall && (
          <Button size="xs" disabled={busy} onClick={() => void install(agent.id, true)}>
            Reinstall
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={!saved || busy}
          onClick={() => onDefaults(agent.id)}
        >
          Defaults…
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`More for ${agent.displayName}`}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={!installed || !saved?.enabled || probing}
              onSelect={() => probe(agent.id)}
            >
              {saved?.enabled ? "Reload model list" : "Enable agent to reload models"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => copyText(saved?.acpCommand ?? agent.defaultAcpCommand)}
            >
              Copy ACP command
            </DropdownMenuItem>
            {(agent.installCommand ?? agent.installHint) && (
              <DropdownMenuItem
                onSelect={() => copyText(agent.installCommand ?? agent.installHint)}
              >
                Copy install command
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Every ACP agent the daemon detects: whether it starts, what it runs with, and how to install or update it. */
export function AgentList({ onDefaults }: { onDefaults: (id: string) => void }) {
  const detected = useAgentsStore((state) => state.detected);
  const configured = useDaemon().snapshot.agents ?? [];
  if (detected.length === 0) {
    return <p className="px-2 text-sm text-muted-foreground">No agents detected yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {detected.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          saved={configured.find((item) => item.id === agent.id)}
          configured={configured}
          onDefaults={onDefaults}
        />
      ))}
    </ul>
  );
}
