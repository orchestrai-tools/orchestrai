// ACP agent for lead agent/model tests: advertises a model selector, logs
// which agent started and every model it was set to, writes one file per
// turn, and approves when asked for a review verdict.
//
// Usage: node mock-acp-lead.mjs <log-file> <agent-name> <model> [model...]
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logFile, name, ...models] = process.argv.slice(2);
const SID = `mock-session-${name}`;
let buf = "";
let cwd = process.cwd();
let turns = 0;

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const log = (line) => appendFileSync(logFile, `${line}\n`);
const selector = (current) => [
  {
    id: "model",
    name: "Model",
    category: "model",
    currentValue: current,
    options: models.map((value) => ({ value, name: value })),
  },
];

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
    log(`${name} started`);
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: { sessionId: SID, configOptions: selector(models[0]) },
    });
  } else if (msg.method === "session/set_config_option") {
    log(`${name} model ${msg.params.value}`);
    send({ jsonrpc: "2.0", id: msg.id, result: { configOptions: selector(msg.params.value) } });
  } else if (msg.method === "session/prompt") {
    turns += 1;
    const review = JSON.stringify(msg.params.prompt).includes("verdict");
    if (!review) writeFileSync(join(cwd, `${name}-change.txt`), `change ${turns}\n`);
    const text = review
      ? 'Looks good.\n```json\n{"verdict": "approve", "findings": []}\n```'
      : `LEAD-DONE by ${name}.`;
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: SID,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
      },
    });
    send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } });
  } else if (msg.id !== undefined && msg.method) {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
  }
}
