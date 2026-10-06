import type { SessionUpdate, WorkflowVerification } from "@warpforge/protocol";

export function attachmentNames(updates: SessionUpdate[]): string[] {
  const names: string[] = [];
  for (const update of updates) {
    if (update.kind !== "user_message") continue;
    for (const item of update.attachments ?? []) {
      names.push(item.type === "file" ? item.path : item.name);
    }
  }
  return names;
}

/** Service lines the daemon prepended, each `- name → http://localhost:port`. */
export function includedServices(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith("[warpforge]"));
  if (start < 0) return [];
  const found: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("- ")) break;
    found.push(line.slice(2));
  }
  return found;
}

/** The localhost URL in a service line, unless that service is still starting. */
export function serviceLineUrl(line: string): string | null {
  if (line.includes("(starting)")) return null;
  return line.match(/https?:\/\/localhost:\d+/)?.[0] ?? null;
}

export function latestVerification(
  verifications: WorkflowVerification[] | undefined,
): WorkflowVerification | null {
  if (!verifications || verifications.length === 0) return null;
  return verifications[verifications.length - 1] ?? null;
}
