import { toast } from "sonner";

import { daemon, DaemonRpcError } from "@/daemon";

/**
 * Send an answer to a permission request. A request the daemon reports as
 * already resolved counts as answered: the outcome that won is in the stream.
 * @param taskId the task whose session asked
 * @param requestId the request being answered
 * @param outcome the option picked
 * @returns false when the answer failed and the prompt should be offered again
 */
export async function answerPermission(
  taskId: string,
  requestId: string,
  outcome: string,
): Promise<boolean> {
  try {
    await daemon.request("session.permission", {
      outcome,
      request_id: requestId,
      task_id: taskId,
    });
    return true;
  } catch (error) {
    if (error instanceof DaemonRpcError && error.code === "permission_already_resolved") {
      return true;
    }
    toast.error("Could not answer the permission request", {
      description: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
