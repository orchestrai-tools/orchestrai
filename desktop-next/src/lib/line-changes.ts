/** How many lines differ, including a line that exists on only one side. */
export function changedLineCount(oldText: string, next: string): number {
  if (oldText === next) return 0;
  const oldLines = lines(oldText);
  const nextLines = lines(next);
  const length = Math.max(oldLines.length, nextLines.length);
  let count = 0;
  for (let index = 0; index < length; index++) {
    if (oldLines[index] !== nextLines[index]) count += 1;
  }
  return count;
}

/** The change to land on. With nothing selected, next is the first and previous is the last. */
export function nextChangeIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta < 0 ? count - 1 : 0;
  return (current + delta + count) % count;
}

/** The change after or before a cursor line. The change on that line is left behind. */
export function changeIndexNear(
  lines: readonly number[],
  cursorLine: number,
  delta: number,
): number {
  if (lines.length === 0) return -1;
  if (cursorLine < 0) return nextChangeIndex(-1, delta, lines.length);
  if (delta > 0) {
    const found = lines.findIndex((line) => line > cursorLine);
    return found === -1 ? 0 : found;
  }
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if ((lines[index] ?? 0) < cursorLine) return index;
  }
  return lines.length - 1;
}

/** Cycle a selected change that the cursor is still on. A moved cursor starts a new step. */
export function chooseChangeIndex(
  current: number,
  delta: number,
  lines: readonly number[],
  cursorLine: number,
): number {
  const selected = current >= 0 ? lines[current] : undefined;
  if (selected == null || (cursorLine >= 0 && cursorLine !== selected)) {
    return changeIndexNear(lines, cursorLine, delta);
  }
  return nextChangeIndex(current, delta, lines.length);
}

/** 0-based line numbers that differ from the committed text. */
export function changedLineNumbers(oldText: string, next: string): number[] {
  const oldLines = lines(oldText);
  const nextLines = lines(next);
  const length = Math.max(oldLines.length, nextLines.length);
  const found: number[] = [];
  for (let index = 0; index < length; index++) {
    if (oldLines[index] !== nextLines[index]) found.push(index);
  }
  return found;
}

/** Put one changed line back, or drop it when the commit did not have that line. */
export function revertChangedLine(oldText: string, next: string, line: number): string {
  const oldLines = lines(oldText);
  const nextLines = lines(next);
  if (line < 0 || line >= nextLines.length) return next;
  if (line >= oldLines.length) nextLines.splice(line, 1);
  else nextLines[line] = oldLines[line] ?? "";
  const body = nextLines.join("\n");
  return next.endsWith("\n") || oldText.endsWith("\n") ? `${body}\n` : body;
}

/** The working-tree text of one changed line, for copying. */
export function changedLineText(oldText: string, next: string, line: number): string {
  const nextLines = lines(next);
  const oldLines = lines(oldText);
  if (line < nextLines.length) return nextLines[line] ?? "";
  return oldLines[line] ?? "";
}

function lines(text: string): string[] {
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}
