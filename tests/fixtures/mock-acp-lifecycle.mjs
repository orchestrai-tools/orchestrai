// Records lifecycle traffic and holds initialization or a HOLD turn until a
// test releases its own gate. All state belongs to the caller's temp directory.
import fs from "node:fs";

const log = process.argv[2];
const initializeGate = process.argv[3];
const image = process.argv[4] !== "false";
const sid = "lifecycle-session";
let buffer = "";
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const reply = (message, result) => send({ jsonrpc: "2.0", id: message.id, result });
const record = (message) => fs.appendFileSync(log, `${JSON.stringify({ pid: process.pid, method: message.method, params: message.params })}\n`);

function initialize(message) {
  reply(message, {
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, promptCapabilities: { image, embeddedContext: true } },
  });
}

function handle(message) {
  record(message);
  if (message.method === "initialize") {
    if (!initializeGate || fs.existsSync(initializeGate)) return initialize(message);
    const timer = setInterval(() => {
      if (!fs.existsSync(initializeGate)) return;
      clearInterval(timer);
      initialize(message);
    }, 10);
  } else if (message.method === "session/load") {
    reply(message, {});
  } else if (message.method === "session/new") {
    reply(message, { sessionId: sid });
  } else if (message.method === "session/prompt") {
    const text = message.params.prompt.map((block) => block.text ?? "").join("");
    if (!text.includes("HOLD")) reply(message, { stopReason: "end_turn" });
  }
}

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handle(JSON.parse(line));
  }
});
