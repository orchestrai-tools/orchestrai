export interface DemoDoc {
  path: string;
  title: string;
  text?: string;
  /** Unix seconds, when the page was last written. */
  updated?: number;
}

/** The demo starts with a wiki, a plan, a transcript, and a decision. Writes add or replace a page. */
export function demoDocsSeed(): DemoDoc[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    { path: "README.md", title: "Demo", updated: now - 60 * 60 },
    {
      path: "guide.mdx",
      title: "Guide",
      text: "## Guide\n\nThe columns stay.\n",
      updated: now - 2 * 60 * 60,
    },
    {
      path: ".github/pull_request_template.md",
      title: "Pull request",
      text: "# Pull request\n\nSay what changed.\n",
      updated: now - 3 * 60 * 60,
    },
    {
      path: "plans/shell.md",
      title: "Shell plan",
      text: "# Shell plan\n\nGroup the columns.\n",
      updated: now - 4 * 60 * 60,
    },
    {
      path: "transcripts/sketch-the-shell.md",
      title: "Sketch the shell",
      text: "# Sketch the shell\n\nThe first pass of the board.\n",
      updated: now - 5 * 60 * 60,
    },
    {
      path: "docs/adr/0026-docs.md",
      title: "Docs stay files",
      text: "# Docs stay files\n\nThe index is the files.\n",
      updated: now - 6 * 60 * 60,
    },
  ];
}

export function docSnippet(text: string | undefined): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

export function demoDocsList(
  docs: DemoDoc[],
): Array<{ path: string; title: string; updated?: number; snippet: string }> {
  return docs
    .map(({ path, title, updated, text }) => ({ path, title, updated, snippet: docSnippet(text) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function demoDocsWrite(docs: DemoDoc[], path: string, content: string): { path: string } {
  const title =
    content
      .split("\n")
      .map((line) => /^(#{1,6})\s+(\S.*)$/.exec(line.trim())?.[2])
      .find((heading) => heading) ||
    path.split("/").pop() ||
    path;
  const updated = Math.floor(Date.now() / 1000);
  const existing = docs.find((doc) => doc.path === path);
  if (existing) {
    existing.title = title;
    existing.updated = updated;
    existing.text = content;
  } else docs.push({ path, title, text: content, updated });
  return { path };
}

export function demoDocText(docs: DemoDoc[], path: string): string | null {
  return docs.find((doc) => doc.path === path)?.text ?? null;
}
