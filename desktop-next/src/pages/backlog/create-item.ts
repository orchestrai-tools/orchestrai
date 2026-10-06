import type { daemon } from "@warpforge/daemon";
import type { BacklogItem } from "@warpforge/protocol";

import type { Source } from "./labels";

type BacklogDaemon = Pick<
  typeof daemon,
  "createBacklog" | "createExternalWorkItem" | "attachBacklogExternal" | "deleteBacklog"
>;

export interface NewItemInput {
  project: string;
  source: Source;
  title: string;
  body: string;
  status: string;
  priority: string;
  assignee: string;
}

/**
 * Adds the backlog row and, for a tracker destination, opens the issue there
 * and links the two. If the tracker half fails the row is deleted again, so
 * no item claims to live in a tracker it never reached.
 */
export async function createWorkItem(
  client: BacklogDaemon,
  input: NewItemInput,
): Promise<{ item: BacklogItem; externalId?: string }> {
  const local = input.source === "local";
  const item = await client.createBacklog({
    project: input.project,
    title: input.title,
    body: input.body,
    // A tracker owns its issues' status and assignee; the next sync would overwrite them.
    status: local ? input.status : "todo",
    priority: input.priority,
    source: input.source,
    assignee: local ? input.assignee.trim() || null : null,
  });
  if (input.source === "local") return { item };
  const provider = input.source;
  try {
    const created = await client.createExternalWorkItem({
      itemId: item.id,
      project: input.project,
      provider,
      title: input.title,
      body: input.body,
    });
    await client.attachBacklogExternal({
      itemId: item.id,
      project: input.project,
      provider,
      externalId: created.externalId,
      url: created.url,
    });
    return {
      item: { ...item, url: created.url, externalId: created.externalId },
      externalId: created.externalId,
    };
  } catch (err) {
    await client.deleteBacklog(item.id, input.project).catch(() => undefined);
    throw err;
  }
}
