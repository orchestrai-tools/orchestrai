/** C0 controls, DEL, and AppKit's private-use function-key range (not the Apple logo). */
function isControlChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f || (code >= 0xf700 && code <= 0xf8fe);
}

/**
 * Whether a `beforeinput` would type nothing but control characters. On macOS a
 * child webview (tauri `unstable`) hands an unhandled arrow key back as
 * `insertText` with its legacy code (U+001D for →); nothing types these legitimately.
 * @param event the input event about to change a field
 * @returns true when the insertion should be cancelled
 */
export function isControlCharInsertion(event: Pick<InputEvent, "inputType" | "data">): boolean {
  return event.inputType === "insertText" && !!event.data && [...event.data].every(isControlChar);
}

/**
 * Cancel such insertions in every field of the page, before the value changes.
 * @param target where to listen; the document by default
 * @returns a function that removes the listener
 */
export function installControlCharGuard(target: Document = document): () => void {
  const onBeforeInput = (event: Event) => {
    if (isControlCharInsertion(event as InputEvent)) event.preventDefault();
  };
  target.addEventListener("beforeinput", onBeforeInput, { capture: true });
  return () => target.removeEventListener("beforeinput", onBeforeInput, { capture: true });
}
