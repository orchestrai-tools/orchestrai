import { daemon } from "@warpforge/daemon";
import { useEffect, useState } from "react";

import { isUnseen, seedSeen, useInboxSeen } from "../lib/inbox-seen";
import { refreshToolUpdates, useToolUpdateCounts, useToolUpdates } from "../lib/tool-updates";
import { useDaemon } from "../lib/use-daemon";
import type { PageId } from "../model/pages";
import { useProjectMarks } from "./project-marks";

export interface NavBadges {
  counts: Partial<Record<PageId, number>>;
  /** Pages whose count could not be loaded; their zero is unknown, not empty. */
  failed: Partial<Record<PageId, boolean>>;
  retry: () => void;
}

/** The counts beside sidebar pages: what needs you, what runs, unread pull requests, and updates. */
export function useNavBadges(project: string | null): NavBadges {
  const connected = useDaemon().connection === "connected";
  const { marks } = useProjectMarks();
  const seenTick = useInboxSeen((state) => state.tick);
  const [unread, setUnread] = useState(0);
  const [pullsFailed, setPullsFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const updates = useToolUpdateCounts();
  const agentsFailed = useToolUpdates((state) => state.agentsFailed);

  useEffect(() => {
    if (!project || !connected) return;
    let live = true;
    void daemon.listPulls(project, { state: "open" }).then(
      (rows) => {
        if (!live) return;
        seedSeen(rows);
        setUnread(rows.filter(isUnseen).length);
        setPullsFailed(false);
      },
      () => {
        if (!live) return;
        setUnread(0);
        setPullsFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [project, connected, seenTick, attempt]);

  const mark = project ? marks.get(project) : undefined;
  return {
    counts: {
      inbox: mark?.waiting,
      board: mark?.running,
      github: unread,
      agents: updates.agents,
      settings: updates.total,
    },
    failed: { github: pullsFailed, agents: agentsFailed },
    retry: () => {
      setAttempt((count) => count + 1);
      refreshToolUpdates();
    },
  };
}
