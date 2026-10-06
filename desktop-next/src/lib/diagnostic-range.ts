export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface EditorDiagnostic {
  fromLine: number;
  fromChar: number;
  toLine: number;
  toChar: number;
  message: string;
  severity: DiagnosticSeverity;
}

/** Map a language-server position onto offsets in the editor document. */
export function offsetAt(text: string, line: number, character: number): number {
  let offset = 0;
  let current = 0;
  while (current < line) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
    current += 1;
  }
  return Math.min(text.length, offset + Math.max(0, character));
}

/** A zero-width server range still marks one character so the underline is visible. */
export function diagnosticSpan(
  text: string,
  item: Pick<EditorDiagnostic, "fromLine" | "fromChar" | "toLine" | "toChar">,
): { from: number; to: number } {
  const from = offsetAt(text, item.fromLine, item.fromChar);
  let to = offsetAt(text, item.toLine, item.toChar);
  if (to <= from) to = Math.min(text.length, from + 1);
  return { from, to };
}
