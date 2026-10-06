import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { GripVerticalIcon, PinOffIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactGridLayout, { type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { SelectMenu } from "../../components/common/select-menu";
import { StatusDot, runStatus } from "../../components/common/status-mark";
import { agentFamily, isLead, memberLabel } from "../../lib/agent-family";
import { pinnedRoots } from "../../lib/pin-group";
import { useShell } from "../../lib/shell-store";
import { ProjectBadge } from "../../shell/project-badge";
import { TONE_TEXT, taskTitle, useTaskLine } from "../board/task-facts";
import { PinChat } from "./pin-chat";

/** An orchestrator's workers, one pick away from the lead's card. */
function FamilySwitch({
  task,
  tasks,
  onOpen,
}: {
  task: TaskInfo;
  tasks: TaskInfo[];
  onOpen: (id: string) => void;
}) {
  const family = agentFamily(task.id, tasks);
  const root = family[0];
  if (!root || !isLead(root, family.length - 1)) return null;
  if (family.length <= 1)
    return <span className="text-xs text-muted-foreground">Orchestrator</span>;
  return (
    <SelectMenu
      label={`${family.length - 1} workers`}
      value={task.id}
      options={family.map((member, index) => ({
        value: member.id,
        label: memberLabel(member, index, root),
        hint: member.status,
      }))}
      onChange={onOpen}
      className="h-6 w-36 text-xs"
    />
  );
}

function PinCard({ task, tasks }: { task: TaskInfo; tasks: TaskInfo[] }) {
  const shell = useShell();
  const line = useTaskLine(task);
  const open = () => shell.openTask(task.id, task.project);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border bg-background shadow-xs">
      <header className="flex items-start gap-2 border-b px-2 py-2">
        <span
          data-pin-handle
          aria-label="Drag to move"
          className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-3.5" />
        </span>
        <button
          type="button"
          onClick={open}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <span className="flex items-center gap-2">
            <StatusDot status={runStatus(task, Boolean(line.pull))} />
            <span className="truncate text-sm font-medium">{taskTitle(task)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ProjectBadge name={task.project} className="size-3.5 text-[9px]" />
            <span className="truncate">{task.project}</span>
            <span aria-hidden>·</span>
            <span>{task.status}</span>
            {line.activity && (
              <span className={TONE_TEXT[line.activity.tone]}>{line.activity.label}</span>
            )}
          </span>
        </button>
        <FamilySwitch task={task} tasks={tasks} onOpen={(id) => shell.openTask(id, task.project)} />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Unpin ${taskTitle(task)}`}
          onClick={() => shell.togglePin(task.id, tasks)}
        >
          <PinOffIcon />
        </Button>
      </header>
      {line.summary && (
        <p className="truncate border-b px-3 py-1 text-xs text-muted-foreground">{line.summary}</p>
      )}
      <PinChat task={task} />
    </article>
  );
}

/** Pinned tasks as a board of live conversations you can move, resize, and answer in place. */
export function PinnedGrid({ tasks }: { tasks: TaskInfo[] }) {
  const pinnedIds = useShell((state) => state.pinned);
  const pinnedLayout = useShell((state) => state.pinnedLayout);
  const setPinnedLayout = useShell((state) => state.setPinnedLayout);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const pinned = pinnedRoots(tasks, pinnedIds);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const read = () => setWidth(node.clientWidth || 800);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pinned.length]);

  const layout = useMemo<LayoutItem[]>(
    () =>
      pinned.map((task) => {
        const stored = pinnedLayout[task.id];
        return {
          i: task.id,
          x: stored?.x ?? 0,
          y: stored?.y ?? 0,
          w: stored?.w ?? 2,
          h: Math.max(stored?.h ?? 4, 4),
          minW: 1,
          minH: 4,
          maxW: 4,
        };
      }),
    [pinned, pinnedLayout],
  );

  if (pinned.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-10 text-center text-xs text-muted-foreground">
        Pin a task from its menu to keep its conversation here.
      </p>
    );
  }

  return (
    <div ref={host}>
      <ReactGridLayout
        layout={layout}
        width={width}
        gridConfig={{ cols: 4, rowHeight: 72, margin: [8, 8], containerPadding: [0, 0] }}
        dragConfig={{ enabled: true, handle: "[data-pin-handle]" }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        onLayoutChange={(next) => {
          for (const item of next) {
            const current = pinnedLayout[item.i];
            if (
              !current ||
              current.x !== item.x ||
              current.y !== item.y ||
              current.w !== item.w ||
              current.h !== item.h
            ) {
              setPinnedLayout(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
            }
          }
        }}
      >
        {pinned.map((task) => (
          <div key={task.id}>
            <PinCard task={task} tasks={tasks} />
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
