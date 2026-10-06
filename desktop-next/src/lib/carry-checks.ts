/**
 * The checked paths after the diff is read again behind the user's back: a
 * file they unchecked stays unchecked, a file that is new to the list arrives
 * checked, and a file that left the list drops out.
 */
export function carryChecks(
  previous: readonly string[] | null,
  checked: readonly string[],
  next: readonly string[],
): string[] {
  if (previous === null) return [...next];
  const known = new Set(previous);
  const on = new Set(checked);
  return next.filter((path) => on.has(path) || !known.has(path));
}
