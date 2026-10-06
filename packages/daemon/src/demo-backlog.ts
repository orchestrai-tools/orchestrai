import { bytesToBase64 } from "./base64";

type Row = Record<string, unknown>;

const nowSecs = () => Math.floor(Date.now() / 1000);

/** Demo backlog rows. One is a GitHub issue; the other is local. */
export function demoBacklogItems(): Array<Record<string, unknown>> {
  return [
    {
      assignee: null,
      body: "The new tab should list running services.\n\n![Start page sketch](https://github.com/user-attachments/assets/demo-start-page)",
      createdAt: 1,
      id: "gh-12",
      number: 12,
      priority: "none",
      project: "demo",
      source: "github",
      status: "todo",
      title: "Browser start page",
      url: "https://github.com/example/demo/issues/12",
      updatedAt: 1,
    },
    {
      assignee: "ada",
      body: "",
      createdAt: 1,
      id: "local-1",
      number: 1,
      priority: "high",
      project: "demo",
      source: "local",
      status: "todo",
      title: "Sketch the board",
      updatedAt: 1,
    },
  ];
}

/** An issue the demo tracker reports on the first import, then never again. */
function demoImportedIssue(project: string, number: number): Row {
  return {
    assignee: null,
    body: "Pasting a link into the composer should keep its title.",
    createdAt: nowSecs(),
    externalId: "#14",
    id: "gh-14",
    number,
    priority: "none",
    project,
    remoteStatus: "open",
    source: "github",
    status: "todo",
    title: "Keep link titles on paste",
    url: "https://github.com/example/demo/issues/14",
    updatedAt: nowSecs(),
  };
}

const DEMO_IMAGE = bytesToBase64(
  new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#e4e4e7"/><text x="240" y="140" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#52525b">Tracker attachment</text></svg>',
  ),
);

/** Apply the same filters the backlog store uses. An empty filter matches all. */
export function filterDemoBacklog(
  items: Array<Record<string, unknown>>,
  query: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const project = String(query.project ?? "");
  const source = String(query.source ?? "");
  const status = String(query.status ?? "");
  const priority = String(query.priority ?? "");
  const assignee = String(query.assignee ?? "")
    .trim()
    .toLowerCase();
  const search = String(query.search ?? "").toLowerCase();
  return items.filter((item) => {
    if (project && item.project !== project) return false;
    if (source && item.source !== source) return false;
    if (status && item.status !== status) return false;
    if (priority && item.priority !== priority) return false;
    if (assignee && String(item.assignee ?? "").toLowerCase() !== assignee) return false;
    if (search && !`${item.title ?? ""} ${item.body ?? ""}`.toLowerCase().includes(search))
      return false;
    return true;
  });
}

const patchRow = (items: Row[], id: unknown, change: Row) =>
  items.map((item) =>
    item.id === String(id ?? "") ? { ...item, ...change, updatedAt: nowSecs() } : item,
  );

/**
 * Backlog and tracker calls in demo mode: the rows after the call, and the
 * reply. `null` when the method is not a backlog one.
 */
export function demoBacklogReply(
  items: Row[],
  method: string,
  p: Row,
): { items: Row[]; reply: unknown } | null {
  switch (method) {
    case "backlog.list": {
      const rows = filterDemoBacklog(items, p);
      return {
        items,
        reply: { hasNextPage: false, items: rows, page: 1, pageSize: 50, total: rows.length },
      };
    }
    case "backlog.delete":
      return { items: items.filter((item) => item.id !== String(p.item_id ?? "")), reply: {} };
    case "backlog.create": {
      const item = {
        assignee: p.assignee == null || p.assignee === "" ? null : String(p.assignee),
        body: String(p.body ?? ""),
        createdAt: nowSecs(),
        id: `item-${items.length + 1}`,
        number: items.length + 1,
        priority: String(p.priority ?? "none"),
        project: String(p.project ?? "demo"),
        source: String(p.source ?? "local"),
        status: String(p.status ?? "todo"),
        title: String(p.title ?? ""),
        updatedAt: nowSecs(),
      };
      return { items: [...items, item], reply: item };
    }
    case "backlog.update": {
      const change = Object.fromEntries(
        ["title", "body", "status", "priority", "assignee"]
          .filter((key) => p[key] != null)
          .map((key) => [key, key === "assignee" && p[key] === "" ? null : p[key]]),
      );
      const next = patchRow(items, p.item_id, change);
      return { items: next, reply: next.find((item) => item.id === String(p.item_id ?? "")) ?? {} };
    }
    case "backlog.attachExternal":
      return {
        items: patchRow(items, p.item_id, { externalId: p.external_id, url: p.url }),
        reply: {},
      };
    case "workItem.createExternal": {
      const number = 100 + items.length;
      const repo =
        p.provider === "linear"
          ? "https://linear.app/demo/issue/DEMO-"
          : "https://github.com/example/demo/issues/";
      return {
        items,
        reply: {
          externalId: p.provider === "linear" ? `DEMO-${number}` : `#${number}`,
          itemId: String(p.item_id ?? ""),
          provider: p.provider,
          status: "todo",
          url: `${repo}${number}`,
        },
      };
    }
    case "workItem.importExternal": {
      const project = String(p.project ?? "demo");
      if (items.some((item) => item.id === "gh-14"))
        return { items, reply: { items: [], synced: [] } };
      const issue = demoImportedIssue(project, items.length + 1);
      return {
        items: [...items, issue],
        reply: { items: [{ ...issue, itemId: issue.id, provider: "github" }], synced: [] },
      };
    }
    case "workItem.syncExternal":
      return { items, reply: { items: [] } };
    case "workItem.linkTask":
      return { items: patchRow(items, p.item_id, { taskId: p.task_id }), reply: {} };
    case "tracker.projectSources":
      return { items, reply: { github: true, linear: false, local: true, project: p.project } };
    case "tracker.attachment":
      return { items, reply: { contentType: "image/svg+xml", dataBase64: DEMO_IMAGE } };
    default:
      return null;
  }
}
