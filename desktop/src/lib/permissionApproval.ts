/**
 * The option that counts as "approve": a one-shot approval, never a lasting
 * `allow_always` grant, which has to be read in the task.
 * @param options the options the request offers
 * @returns the one-shot approval, or undefined when the request has none
 */
export function approvePermissionOption(options: readonly string[]): string | undefined {
  return options.find((option) => ONE_SHOT_APPROVALS.has(normalize(option)));
}

/**
 * The option a toast or native banner may approve with one click. A browser
 * site grant has none: it is read and answered in the task, where it names the
 * site the agent would act on as the user.
 * @param request the prompt
 * @returns the one-shot approval, or undefined when there is none to offer
 */
export function quickApproveOption(request: {
  options: readonly string[];
  browser_origin?: string;
}): string | undefined {
  return request.browser_origin ? undefined : approvePermissionOption(request.options);
}

const ONE_SHOT_APPROVALS = new Set(["allow", "allow_once", "approve", "approve_once"]);

function normalize(option: string): string {
  return option
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
