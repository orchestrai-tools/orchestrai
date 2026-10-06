import type { SessionUpdate } from "@warpforge/protocol";

/** A conversation becomes one markdown file inside the project. */
export function transcriptPath(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `transcripts/${slug || id}.md`;
}

/** The task whose saved conversation is this file, when the path matches. */
export function taskForTranscript(
  path: string,
  tasks: { id: string; title: string; prompt: string }[],
): string | null {
  const task = tasks.find(
    (entry) => transcriptPath(entry.title || entry.prompt, entry.id) === path,
  );
  return task?.id ?? null;
}

export function transcriptToMarkdown(title: string, updates: SessionUpdate[]): string {
  const lines = [`# ${title.trim() || "Conversation"}`, ""];
  for (const update of updates) {
    const block = blockFor(update);
    if (!block) continue;
    lines.push(block, "");
  }
  return lines.join("\n");
}

function blockFor(update: SessionUpdate): string | null {
  switch (update.kind) {
    case "user_message":
      return `## You\n\n${update.text}`;
    case "agent_text":
      return `## Agent\n\n${update.text}`;
    case "agent_thought":
      return `## Thought\n\n${update.text}`;
    case "tool_call":
      return `## ${update.title}\n\n${update.status}${update.content ? `\n\n${update.content}` : ""}`;
    case "file_edit":
      return `## ${update.path}\n\n+${update.additions ?? 0} −${update.deletions ?? 0}`;
    case "plan":
      return `## Plan\n\n${update.entries
        .map((entry) => `- [${entry.status === "completed" ? "x" : " "}] ${entry.content}`)
        .join("\n")}`;
    case "advisor_consultation":
      return `## Advisor\n\n${update.question}\n\n${update.answer}`;
    default:
      return null;
  }
}
