import { toast } from "sonner";

import { daemon } from "@/daemon";
import { DaemonRpcError } from "@/daemon/rpcError";

/**
 * Write an editor buffer to disk, and toast the daemon's reason when it refuses.
 * @param params the `file.save` params: the checkout (`task_id` or `project`), `path` and `content`
 */
export function saveFile(params: {
  content: string;
  path: string;
  project?: string;
  task_id: string;
}): void {
  void daemon.request("file.save", params).catch((cause: unknown) => {
    toast.error(`Could not save ${params.path}`, {
      description: cause instanceof DaemonRpcError ? cause.detail : String(cause),
    });
  });
}
