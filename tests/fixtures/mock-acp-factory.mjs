// ACP agent for backlog-runner tests: every prompt writes one file into the
// session's checkout and ends the turn, so the pipeline leaves a change to deliver.
//
// Usage: node mock-acp-factory.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let buf = "";
let cwd = process.cwd();
const SID = "mock-session-factory";
let turns = 0;

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handle(JSON.parse(line));
  }
});

function handle(msg) {
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentCapabilities: {} } });
  } else if (msg.method === "session/new") {
    if (msg.params && typeof msg.params.cwd === "string") cwd = msg.params.cwd;
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: SID } });
  } else if (msg.method === "session/prompt") {
    turns += 1;
    writeFileSync(join(cwd, "factory-change.txt"), `change ${turns}\n`);
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: SID,
        update: {
          sessionUpdate: "usage_update",
          used: 10,
          size: 100,
          cost: { amount: 0.5 * turns, currency: "USD" },
        },
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: SID,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "IMPL-DONE: wrote factory-change.txt." },
        },
      },
    });
    send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } });
  } else if (msg.id !== undefined && msg.method) {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
  }
}
