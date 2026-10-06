/** Reviewers, the round-limit action, and template variables read from a workflow file. */
export interface WorkflowNotes {
  onLimit: string | null;
  reviewers: string[];
  variables: string[];
}

/** Pull the review block out of a workflow YAML file. Built-ins have no file until they are copied. */
export function workflowNotes(yaml: string): WorkflowNotes {
  const onLimit = yaml.match(/^[\t ]*on_limit:[\t ]*([A-Za-z_]+)/m)?.[1] ?? null;
  const variables = [...new Set([...yaml.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1]))];
  return { onLimit, reviewers: reviewerNames(yaml), variables };
}

function reviewerNames(yaml: string): string[] {
  const lines = yaml.split("\n");
  const header = lines.findIndex((line) => /^[\t ]*reviewers:[\t ]*(#.*)?$/.test(line));
  if (header < 0) return [];
  const indent = lines[header].match(/^[\t ]*/)?.[0].length ?? 0;
  const names: string[] = [];
  let current: string | null = null;
  for (const line of lines.slice(header + 1)) {
    if (line.trim() === "" || /^[\t ]*#/.test(line)) continue;
    const code = line.replace(/#.*$/, "");
    const width = code.match(/^[\t ]*/)?.[0].length ?? 0;
    if (code.trim() === "") continue;
    if (width <= indent) break;
    const item = code.match(/^[\t ]+-[\t ]*(.*)$/);
    if (item && width === indent + 2) {
      if (current) names.push(current);
      const agent = item[1].match(/agent:[\t ]*(\S+)/);
      current = agent?.[1] ?? "Lead";
      continue;
    }
    const agent = code.match(/agent:[\t ]*(\S+)/);
    if (agent && current === "Lead") current = agent[1];
  }
  if (current) names.push(current);
  return names;
}
