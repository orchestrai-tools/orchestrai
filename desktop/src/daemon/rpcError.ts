/**
 * A daemon RPC failure with its wire `code` preserved. `.message` keeps the
 * `"<code>: <message>"` shape callers already display; `.detail` is the raw
 * daemon message without the code prefix.
 */
export class DaemonRpcError extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "DaemonRpcError";
    this.code = code;
    this.detail = detail;
  }
}
