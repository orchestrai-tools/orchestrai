/** The one sentence that must sit next to every dollar figure. */
export const SPEND_DISCLAIMER = "Estimated at API rates — not what you were billed.";

/**
 * Dollars for display: cents below $1,000, no cents above it.
 * A value that is not a finite number returns null.
 */
export function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const digits = Math.round(abs * 100) / 100 >= 1000 ? 0 : 2;
  const amount = abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value < 0 ? "-" : ""}$${amount}`;
}
