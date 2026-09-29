import { useMemo } from "react";

import { prFeedbackReasons } from "@/lib/prFeedback";
import type { TaskPullRequest } from "@/protocol";
import { usePrFeedbackStore } from "@/store/prFeedback";

/**
 * Needs-you reasons for tasks whose pull request has new failing checks or
 * review remarks.
 * @param pulls The daemon's task pull requests by task id.
 * @returns Summary lines by task id.
 */
export function usePrFeedbackReasons(
  pulls: Readonly<Record<string, TaskPullRequest>> | undefined,
): ReadonlyMap<string, string> {
  const handled = usePrFeedbackStore((state) => state.handledByTask);
  return useMemo(() => prFeedbackReasons(pulls, handled), [handled, pulls]);
}
