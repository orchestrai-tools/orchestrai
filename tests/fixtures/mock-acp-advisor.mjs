// ACP agent standing in for an advisor. It advertises a mode selector, logs
// every mode change and prompt to the file in argv[2], asks to edit a file on
// each prompt (the daemon must deny it), then answers with its reply count and
// the last line of the question it was asked.
import { appendFileSync } from "node:fs";

const log = process.argv[2];
const note = (entry) => appendFileSync(log, JSON.stringify(entry) + "\n");
const SID = "advisor-session-1";
const mode = {
  id: "mode",
  name: "Mode",
  category: "mode",
  currentValue: "default",
  options: [
    { value: "default", name: "Default" },
    { value: "read-only", name: "Read only" },
  ],
};
let buf = "";
let answered = 0;
let pending = null;
let nextReqId = 500;

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const update = (u) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SID, update: u } });

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
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentCapabilities: { promptCapabilities: {} } } });
  } else if (msg.method === "session/new") {
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: SID, configOptions: [mode] } });
  } else if (msg.method === "session/set_config_option") {
    mode.currentValue = msg.params.value;
    note({ set: msg.params.configId, value: msg.params.value });
    send({ jsonrpc: "2.0", id: msg.id, result: { configOptions: [mode] } });
  } else if (msg.method === "session/prompt") {
    const text = msg.params.prompt.filter((b) => b.type === "text").map((b) => b.text).join("");
    note({ prompt: text, mode: mode.currentValue });
    pending = { id: msg.id, text };
    send({
      jsonrpc: "2.0",
      id: nextReqId++,
      method: "session/request_permission",
      params: {
        sessionId: SID,
        toolCall: { toolCallId: `w${nextReqId}`, title: "Edit src/lib.rs" },
        options: [
          { optionId: "yes", name: "Allow", kind: "allow_once" },
          { optionId: "no", name: "Deny", kind: "reject_once" },
        ],
      },
    });
  } else if (msg.method === undefined && msg.result !== undefined && pending) {
    note({ permission: msg.result.outcome });
    answered += 1;
    update({ sessionUpdate: "usage_update", used: 10, size: 100, cost: { amount: 0.25 * answered, currency: "USD" } });
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Let me look at the code." } });
    update({ sessionUpdate: "tool_call", toolCallId: `r${answered}`, title: "Read src/lib.rs", status: "completed", kind: "read" });
    const question = pending.text.trim().split("\n").pop();
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: `Advice ${answered}: ${question}` } });
    send({ jsonrpc: "2.0", id: pending.id, result: { stopReason: "end_turn" } });
    pending = null;
  }
}
