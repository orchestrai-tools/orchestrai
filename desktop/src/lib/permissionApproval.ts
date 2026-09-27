/**
 * The option that counts as "approve": a one-shot approval, never a lasting
 * `allow_always` grant, which has to be read in the task.
 * @param options the options the request offers
 * @returns the one-shot approval, or undefined when the request has none
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
