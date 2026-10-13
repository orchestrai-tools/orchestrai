import { useEffect, useMemo } from "react";

/** A late reply may not replace a newer reply or one from another checkout. */
export class RequestGate {
  private generation = 0;
  begin() {
    const ticket = ++this.generation;
    return () => ticket === this.generation;
  }
  invalidate() {
    this.generation += 1;
  }
}

export function useRequestGate(scope: string) {
  const gate = useMemo(() => new RequestGate(), [scope]);
  useEffect(() => () => gate.invalidate(), [gate]);
  return gate;
}
