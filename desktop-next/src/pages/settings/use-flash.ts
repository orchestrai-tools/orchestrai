import { useState } from "react";

/** A short acknowledgement next to a button ("Copied"), gone after a moment. */
export function useFlash(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const flash = (next: string) => {
    setMessage(next);
    setTimeout(() => setMessage((current) => (current === next ? null : current)), 2000);
  };
  return [message, flash];
}
