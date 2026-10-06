import { daemon } from "@warpforge/daemon";
import { useEffect } from "react";
import { toast } from "sonner";
import { historyPrunedMessage, historySweptMessage } from "./history-notice";

/** Tell the user when stored task history is cleaned up. */
export function useHistoryNotices(): void {
  useEffect(() => {
    return daemon.subscribeEvents((event) => {
      if (event.event === "history.pruned") {
        toast.info("Old task history cleaned up", { description: historyPrunedMessage(event.data.updates) });
      } else if (event.event === "history.swept") {
        const description = historySweptMessage(event.data);
        if (description) toast.info("Task cleanup ran", { description });
      }
    });
  }, []);
}
