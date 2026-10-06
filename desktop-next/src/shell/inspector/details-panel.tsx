import type { PullRequestSummary, ServiceInfo, TaskInfo } from "@warpforge/protocol";

import { quotaLeft } from "../../lib/account-chip";
import { plural } from "../../lib/plural";
import { reviewDecisionLabel } from "../../lib/review-decision";
import { pullSizeLabel, useSelectedPull } from "../../lib/selected-pull";
import { PINNED_PORT_TITLE, portWarningText, useSelectedService } from "../../lib/selected-service";
import { currentPage, useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { needsPerson, statusLabel, visibleTasks } from "../../model/tasks";
import { Empty, LinkText, Port, Row, Rows } from "./rows";

function PullDetails({ pull }: { pull: PullRequestSummary | null }) {
  if (!pull) return <Empty>Pick a pull request to see where it stands.</Empty>;
  const decision = reviewDecisionLabel(pull.reviewDecision);
  return (
    <Rows>
      <Row label="Pull request">
        #{pull.number} {pull.title}
      </Row>
      <Row label="State">
        {pull.state}
        {pull.draft ? " · draft" : ""}
      </Row>
      <Row label="Author">{pull.author?.login || "unknown"}</Row>
      {decision && <Row label="Review">{decision}</Row>}
      <Row label="Branch">
        <span className="font-mono">
          {pull.headRefName} → {pull.baseRefName}
        </span>
      </Row>
      <Row label="Size">{pullSizeLabel(pull)}</Row>
      {pull.labels.length > 0 && (
        <Row label="Labels">{pull.labels.map((label) => label.name).join(", ")}</Row>
      )}
      {pull.assignees.length > 0 && <Row label="Assignees">{pull.assignees.join(", ")}</Row>}
      {pull.url && (
        <Row label="Link">
          <LinkText url={pull.url}>Open on GitHub</LinkText>
        </Row>
      )}
    </Rows>
  );
}

/** Every address this project is serving right now, each opening in the browser. */
function RunningAddresses({ project }: { project: string }) {
  const services = useDaemon().snapshot.services.filter(
    (item) => item.project === project && item.status === "running" && item.allocatedPort > 0,
  );
  return (
    <Row label="Running">
      {services.length === 0 ? (
        <span className="text-muted-foreground">Nothing is serving</span>
      ) : (
        <span className="flex flex-col gap-0.5">
          {services.map((item) => (
            <LinkText key={item.name} url={`http://localhost:${item.allocatedPort}`}>
              <span className="font-mono">localhost:{item.allocatedPort}</span>
              <span className="text-muted-foreground"> · {item.name}</span>
            </LinkText>
          ))}
        </span>
      )}
    </Row>
  );
}

function ServiceDetails({ service, project }: { service: ServiceInfo | null; project: string }) {
  if (!service)
    return (
      <>
        <Rows>
          <RunningAddresses project={project} />
        </Rows>
        <Empty>Pick a service to see its port and status.</Empty>
      </>
    );
  const warning = portWarningText(service);
  return (
    <Rows>
      <RunningAddresses project={project} />
      <Row label="Service">{service.name}</Row>
      <Row label="Status">
        {service.status}
        {service.portPinned && <span title={PINNED_PORT_TITLE}> · pinned</span>}
        {service.local && " · local"}
      </Row>
      <Row label="Port">
        <Port port={service.allocatedPort} running={service.status === "running"} />
      </Row>
      <Row label="Command">
        <span className="font-mono">{service.command}</span>
      </Row>
      {warning && (
        <Row label="Warning">
          <span className="text-destructive">{warning}</span>
        </Row>
      )}
    </Rows>
  );
}

function TaskDetails({ task }: { task: TaskInfo }) {
  const state = useDaemon();
  const limits = (state.agentLimits ?? []).find((row) => row.agentId === task.agent && row.active);
  const pull = state.taskPullRequests?.[task.id];
  return (
    <Rows>
      <Row label="Task">{task.title || task.prompt}</Row>
      <Row label="Status">{statusLabel(task.status)}</Row>
      <Row label="Agent">
        {task.agent}
        {task.model ? ` · ${task.model}` : ""}
      </Row>
      {limits && limits.windows.length > 0 && (
        <Row label="Quota">
          {limits.windows
            .map((window) => `${window.label} ${quotaLeft(window.usedPercent)}% left`)
            .join(" · ")}
        </Row>
      )}
      {task.workflowRun && <Row label="Stage">{task.workflowRun.stage}</Row>}
      <Row label="Worktree">
        <span className="font-mono">{task.worktree ?? "checkout"}</span>
      </Row>
      {task.baseBranch && (
        <Row label="Base">
          <span className="font-mono">{task.baseBranch}</span>
        </Row>
      )}
      <Row label="Files">{task.filesChanged}</Row>
      {pull && (
        <Row label="Pull request">
          <LinkText url={pull.url}>
            #{pull.number} · {pull.state}
            {pull.checks ? ` · ${pull.checks}` : ""}
          </LinkText>
        </Row>
      )}
      {task.blockedReason && <Row label="Blocked">{task.blockedReason}</Row>}
    </Rows>
  );
}

/** The inspector describes what is selected: the open task, pull request, or service, else the project. */
export function DetailsPanel() {
  const shell = useShell();
  const { snapshot } = useDaemon();
  const pull = useSelectedPull((store) => store.pull);
  const service = useSelectedService((store) => store.service);
  const page = currentPage(shell);
  if (page === "github") return <PullDetails pull={pull} />;
  if (page === "services")
    return <ServiceDetails service={service} project={shell.project ?? ""} />;
  const task = snapshot.tasks.find(
    (item) => item.id === shell.taskId && item.project === shell.project,
  );
  if (task && (page === "task" || page === "board")) return <TaskDetails task={task} />;
  const project = snapshot.projects.find((item) => item.name === shell.project);
  if (!project) return <Empty>Open a project to see its details.</Empty>;
  const tasks = visibleTasks(snapshot.tasks, project.name);
  return (
    <Rows>
      <Row label="Project">{project.name}</Row>
      <Row label="Path">
        <span className="font-mono">{project.path}</span>
      </Row>
      <Row label="Ports">
        {project.portRange[0]}–{project.portRange[1]}
      </Row>
      <Row label="Running">
        {plural(tasks.filter((item) => item.status === "running").length, "task")}
      </Row>
      <Row label="Needs you">{plural(tasks.filter(needsPerson).length, "task")}</Row>
      <Row label="Services">
        {snapshot.services.filter((item) => item.project === project.name).length}
      </Row>
    </Rows>
  );
}
