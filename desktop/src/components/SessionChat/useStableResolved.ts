import { useEffect, useMemo, useRef } from "react";

import { settledPermissions } from "@/lib/sessionPermissions";

import type { SessionUpdate } from "../../protocol";

export function useStableResolved(
  updates: SessionUpdate[],
  sessionLive: boolean,
): Record<string, string> {
  const ref = useRef<Record<string, string>>({});
  const result = useMemo(() => {
    const next = settledPermissions(updates, sessionLive);
    const prev = ref.current;
    const prevKeys = Object.keys(prev);
    const same =
      prevKeys.length === Object.keys(next).length &&
      prevKeys.every((key) => prev[key] === next[key]);
    if (same) {
      return prev;
    }
    return next;
  }, [sessionLive, updates]);

  useEffect(() => {
    ref.current = result;
  }, [result]);

  return result;
}
