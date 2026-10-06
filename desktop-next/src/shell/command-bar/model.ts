import type { RunCommand, RunCommands, RunParam } from "@warpforge/protocol";

/** One row of the list: a detected command, or a bare line from Saved or History. */
export interface BarItem {
  key: string;
  /** What runs when nothing needs filling in. */
  line: string;
  command?: RunCommand;
}

export interface BarGroup {
  heading: string;
  items: BarItem[];
}

const SOURCE_HEADING = { just: "Just", npm: "Package scripts", make: "Make" } as const;

/** Just recipes in their justfile groups, the default recipe first, ungrouped ones before groups. */
function justGroups(commands: RunCommand[]): BarGroup[] {
  const recipes = commands.filter((c) => c.source === "just");
  if (recipes.length === 0) return [];
  const ordered = [...recipes].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if ((a.group ?? "") !== (b.group ?? "")) {
      if (!a.group) return -1;
      if (!b.group) return 1;
      return a.group.localeCompare(b.group);
    }
    return 0;
  });
  const groups: BarGroup[] = [];
  for (const recipe of ordered) {
    const heading = recipe.group ? `Just · ${recipe.group}` : "Just";
    let group = groups.find((g) => g.heading === heading);
    if (!group) {
      group = { heading, items: [] };
      groups.push(group);
    }
    group.items.push({ key: recipe.id, line: recipe.command, command: recipe });
  }
  return groups;
}

/**
 * Saved, then just recipes by group, package scripts, Make targets, and
 * history. A line already shown as a detected command is not repeated.
 */
export function barGroups(
  saved: readonly string[],
  detected: RunCommands | null,
  history: readonly string[],
): BarGroup[] {
  const commands = detected?.commands ?? [];
  const byLine = new Map(commands.map((c) => [c.command, c]));
  const groups: BarGroup[] = [
    {
      heading: "Saved",
      items: saved.map((line) => ({ key: `saved:${line}`, line, command: byLine.get(line) })),
    },
    ...justGroups(commands),
    ...(["npm", "make"] as const).map((source) => ({
      heading: SOURCE_HEADING[source],
      items: commands
        .filter((c) => c.source === source)
        .map((c) => ({ key: c.id, line: c.command, command: c })),
    })),
    {
      heading: "History",
      items: history
        .filter((line) => !saved.includes(line) && !byLine.has(line))
        .map((line) => ({ key: `history:${line}`, line })),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** What the list filters on: the line, its name, description, and aliases. */
export function searchText(item: BarItem): string {
  const c = item.command;
  if (!c) return item.line;
  return [item.line, c.name, c.description, ...(c.aliases ?? [])].filter(Boolean).join(" ");
}

/** Single-quoted for `sh`, unless it is plainly safe. */
export function shellQuote(value: string): string {
  if (value !== "" && /^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Splits a field holding several values the way a shell would read them, respecting quotes. */
export function splitValues(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  let started = false;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started || current) out.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started || current) out.push(current);
  return out;
}

export function needsInput(command: RunCommand | undefined): boolean {
  return Boolean(command?.params?.length);
}

/** Why the values cannot run yet, or null when they can. */
export function missingValue(params: readonly RunParam[], values: Record<string, string>): string | null {
  for (const [index, param] of params.entries()) {
    const value = values[param.name]?.trim() ?? "";
    if (param.kind === "required" && !value) return `${param.name} is required`;
    if (param.kind === "plus" && splitValues(value).length === 0) return `${param.name} needs at least one value`;
    // Arguments are positional: a later value cannot skip an empty earlier one
    // unless the earlier one has a default to stand in.
    if (param.kind === "optional" && !value && param.default == null) {
      const later = params.slice(index + 1).some((p) => (values[p.name]?.trim() ?? "") !== "");
      if (later) return `${param.name} needs a value before ${params[index + 1]?.name}`;
    }
  }
  return null;
}

/**
 * The shell line for a command and its filled-in parameters. Empty trailing
 * optional parameters are left out so `just` applies its own defaults.
 */
export function commandLine(command: RunCommand, values: Record<string, string>): string {
  const params = command.params ?? [];
  const args: string[][] = params.map((param) => {
    const value = values[param.name]?.trim() ?? "";
    if (param.kind === "plus" || param.kind === "star") return splitValues(value);
    if (value) return [value];
    if (param.kind === "optional" && param.default != null) return [param.default];
    return [];
  });
  let last = args.length - 1;
  while (last >= 0) {
    const param = params[last];
    const value = values[param.name]?.trim() ?? "";
    if (param.kind === "required" || param.kind === "plus" || value) break;
    last -= 1;
  }
  const parts = args.slice(0, last + 1).flat();
  return [confirmedLine(command), ...parts.map(shellQuote)].join(" ");
}

/**
 * The dialog has already asked, and `just` would otherwise ask again on a
 * stdin the command bar does not have, then refuse.
 */
function confirmedLine(command: RunCommand): string {
  if (command.source !== "just" || command.confirm == null) return command.command;
  return command.command.replace(/^just /, "just --yes ");
}

export type RunPlace = "here" | "terminal";

/** Long-running commands open in a terminal; Shift flips the choice for that run. */
export function runPlace(command: RunCommand | undefined, flipped: boolean): RunPlace {
  const long = command?.longRunning ?? false;
  return long !== flipped ? "terminal" : "here";
}
