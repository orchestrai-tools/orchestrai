/**
 * The one rule for which permission option counts as "approve": prefer an
 * explicit one-shot approval (`allow` / `allow_once` / `approve` /
 * `approve_once`, matched case- and separator-insensitively), and never treat a
 * persistent `allow_always` grant as approve — a lasting grant always requires
 * opening the task and reading the request.
 */
export function approvePermissionOption(options: readonly string[]): string | undefined {
  return options.find((option) => ONE_SHOT_APPROVALS.has(normalize(option)));
}

const ONE_SHOT_APPROVALS = new Set(["allow", "allow_once", "approve", "approve_once"]);

function normalize(option: string): string {
  return option
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
