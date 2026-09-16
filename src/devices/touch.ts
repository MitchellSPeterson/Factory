export type TouchPhase = "begin" | "move" | "end";

export function encodeHid(type: number, body: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(body));
  const packet = new Uint8Array(1 + json.length);
  packet[0] = type;
  packet.set(json, 1);
  return packet;
}

export function encodeTouch(args: { type: TouchPhase; x: number; y: number }): Uint8Array {
  return encodeHid(3, { type: args.type, x: clamp01(args.x), y: clamp01(args.y) });
}

export function encodeButton(button: string): Uint8Array {
  return encodeHid(4, { button });
}

export function pointOnRect(args: {
  clientX: number;
  clientY: number;
  rect: { left: number; top: number; width: number; height: number };
}): { x: number; y: number } | null {
  if (args.rect.width <= 0 || args.rect.height <= 0) return null;
  const x = (args.clientX - args.rect.left) / args.rect.width;
  const y = (args.clientY - args.rect.top) / args.rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function configUrlForStream(streamUrl: string): string | null {
  if (!/\/stream\.mjpeg(?:\?|$)/.test(streamUrl)) return null;
  return streamUrl.replace(/\/stream\.mjpeg(?:\?.*)?$/, "/config");
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
