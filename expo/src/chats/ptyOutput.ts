export type PtyDisplayEvent =
  | { kind: "write"; data: string }
  | { kind: "clear" };

export function createPtyDisplayGate() {
  let ready = false;
  const pending: PtyDisplayEvent[] = [];
  return {
    markReady(deliver: (event: PtyDisplayEvent) => void) {
      ready = true;
      const queued = pending.splice(0);
      for (const event of queued) deliver(event);
    },
    push(event: PtyDisplayEvent, deliver: (event: PtyDisplayEvent) => void) {
      if (ready) deliver(event);
      else pending.push(event);
    },
    dropPending() {
      pending.length = 0;
    },
  };
}
