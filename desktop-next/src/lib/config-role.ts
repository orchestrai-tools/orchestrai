import type { ConfigOption } from "@warpforge/protocol";

export function configRole(option: ConfigOption): "model" | "effort" | null {
  const identity = `${option.category ?? ""} ${option.id} ${option.name}`.toLowerCase();
  if (identity.includes("model")) return "model";
  if (/effort|reasoning|thought[_ -]?level/.test(identity)) return "effort";
  return null;
}

export function filterChoices<T extends { name: string; value: string }>(choices: T[], query: string): T[] {
  const text = query.trim().toLowerCase();
  if (!text) return choices;
  return choices.filter((choice) => choice.name.toLowerCase().includes(text) || choice.value.toLowerCase().includes(text));
}
