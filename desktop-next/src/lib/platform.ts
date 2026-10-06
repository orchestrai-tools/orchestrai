/** Native desktop blur exists on macOS and Windows. Linux stays opaque. */
export function nativeGlass(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|Win/i.test(navigator.platform);
}
