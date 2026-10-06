import type { DaemonEvent } from "./events";

// ── Envelope ────────────────────────────────────────────────────────────────

export interface Request {
  id: number;
  method: string;
  params?: unknown;
}

export type ServerMessage =
  | { id: number; result: unknown }
  | { id: number; error: RpcError }
  | DaemonEvent;

export interface RpcError {
  code:
    | "invalid_request"
    | "not_found"
    | "conflict"
    | "permission_already_resolved"
    | "agent_unavailable"
    | "agent_broken_install"
    | "internal"
    | "updating";
  message: string;
}

export function isEvent(msg: ServerMessage): msg is DaemonEvent {
  return "event" in msg;
}
