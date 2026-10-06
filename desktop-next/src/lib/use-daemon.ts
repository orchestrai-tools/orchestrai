import { daemon, type DaemonState } from "@warpforge/daemon";
import { useSyncExternalStore } from "react";

export function useDaemon(): DaemonState {
  return useSyncExternalStore(daemon.subscribe, daemon.getState, daemon.getState);
}
