import type { ClientRequestBody, DaemonEvent } from "@warpforge/protocol";

import type { ConnectionState } from "./types";

/** Does the work of one request; rejects with a message for the agent. */
export type ClientRequestHandler = (
  body: ClientRequestBody,
  signal: AbortSignal,
) => Promise<unknown>;

/** The slice of the daemon client this needs. */
export interface ClientRequestChannel {
  request(method: string, params?: unknown): Promise<unknown>;
  subscribe(fn: () => void): () => void;
  subscribeEvents(fn: (event: DaemonEvent) => void): () => void;
  getState(): { connection: ConnectionState };
}

/** The capability a request body needs; the daemon routes on the same name. */
function capabilityOf(body: ClientRequestBody): string {
  return body.kind;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Answer the daemon's `client.request` events for `capability` with `handler`,
 * registering this client for it on every (re)connect. The daemon sends each
 * request to the newest client that registered, so only one app answers.
 * @param channel the daemon client
 * @param capability the capability served, e.g. `browser`
 * @param handler does the work
 * @returns stops serving
 */
export function serveClientRequests(
  channel: ClientRequestChannel,
  capability: string,
  handler: ClientRequestHandler,
): () => void {
  const running = new Map<string, AbortController>();
  let disposed = false;
  const abortRunning = () => {
    for (const controller of running.values()) controller.abort();
    running.clear();
  };
  const register = () => {
    if (channel.getState().connection !== "connected") return;
    channel.request("client.register", { capabilities: [capability] }).catch(() => {
      // The next reconnect registers again.
    });
  };

  const answer = async (requestId: string, body: ClientRequestBody, timeoutMs: number) => {
    if (disposed || channel.getState().connection !== "connected") return;
    running.get(requestId)?.abort();
    const controller = new AbortController();
    running.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
    controller.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        if (running.get(requestId) === controller) running.delete(requestId);
      },
      { once: true },
    );
    let reply: Record<string, unknown>;
    try {
      reply = { request_id: requestId, result: await handler(body, controller.signal) };
    } catch (error) {
      reply = { request_id: requestId, error: message(error) };
    } finally {
      clearTimeout(timer);
      if (running.get(requestId) === controller) running.delete(requestId);
    }
    // The daemon gave up on it and would refuse the reply.
    if (controller.signal.aborted || disposed || channel.getState().connection !== "connected")
      return;
    channel.request("client.reply", reply).catch(() => {
      // A reply lost with the connection times out on the daemon side.
    });
  };

  let connected = channel.getState().connection === "connected";
  const offState = channel.subscribe(() => {
    const now = channel.getState().connection === "connected";
    if (!now && connected) abortRunning();
    if (now && !connected) register();
    connected = now;
  });
  const offEvents = channel.subscribeEvents((event) => {
    if (event.event === "client.request") {
      if (capabilityOf(event.data.body) === capability) {
        void answer(event.data.request_id, event.data.body, event.data.timeout_ms);
      }
    } else if (event.event === "client.requestCancelled") {
      running.get(event.data.request_id)?.abort();
    }
  });
  register();

  return () => {
    disposed = true;
    offState();
    offEvents();
    abortRunning();
    if (channel.getState().connection === "connected") {
      channel.request("client.register", { capabilities: [] }).catch(() => {});
    }
  };
}
