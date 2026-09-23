// Minimal ACP agent that rejects `initialize` the way codex-acp does when npm
// omitted its platform optional dependency. Used to prove the daemon forwards
// the agent's own error message instead of a generic "rejected initialize".

let buffer = "";

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handle(JSON.parse(line));
  }
});

function handle(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: 1001,
        message:
          "Codex process has exited with code 1: Error: Missing optional dependency " +
          "@openai/codex-darwin-arm64. Reinstall Codex: npm install -g @openai/codex@latest",
      },
    });
  }
}
