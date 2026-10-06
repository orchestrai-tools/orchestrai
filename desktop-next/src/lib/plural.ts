/** `1 task`, `3 tasks`. Pass `many` when adding an s is wrong. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
