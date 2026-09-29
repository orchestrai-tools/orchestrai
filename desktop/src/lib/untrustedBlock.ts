const ZERO_WIDTH = String.fromCharCode(0x200b);

/**
 * Break any forged closing tag in third-party text without hiding the text: a
 * zero-width space after each `<` stops a tag from forming, while `>` stays
 * readable. The same scheme as `src/mcp/untrusted.rs`.
 * @param value Text written by someone other than the user.
 * @returns The text with a zero-width space after each `<`.
 */
export function guardUntrusted(value: string): string {
  return value.replace(/</g, `<${ZERO_WIDTH}`);
}

/**
 * A tagged block around third-party text, so an agent can tell data it was
 * handed from instructions it was given.
 * @param tag The block's tag name, e.g. `browser_annotation`.
 * @param notice Warpforge's own lines saying where the content came from; not guarded.
 * @param content The third-party lines; every one is guarded.
 * @returns The block, one line per entry.
 */
export function untrustedBlock(
  tag: string,
  notice: readonly string[],
  content: readonly string[],
): string {
  return [`<${tag}>`, ...notice, ...content.map(guardUntrusted), `</${tag}>`].join("\n");
}
