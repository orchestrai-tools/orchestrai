/** Escape closes the dialog, unless it landed inside an open menu. */
export function escapeClosesDialog(event: { key: string; target: EventTarget | null }): boolean {
  if (event.key !== "Escape") return false;
  return !(event.target instanceof Element && event.target.closest("[role=menu]"));
}

/** Close a dialog on Escape, unless a menu inside it is using that key. */
export function closeOnEscape(close: () => void): () => void {
  const handler = (event: KeyboardEvent) => {
    if (!escapeClosesDialog(event)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
