import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { configUrlForStream, encodeButton, encodeTouch, pointOnRect, type TouchPhase } from "./touch";

type DeviceScreenProps = {
  name: string;
  streamUrl: string;
  wsUrl?: string;
  onHome?: () => void;
};

const PHASE: Record<0 | 1 | 2, TouchPhase> = { 0: "begin", 1: "move", 2: "end" };

export function DeviceScreen({ name, streamUrl, wsUrl, onHome }: DeviceScreenProps) {
  const hitRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [ratio, setRatio] = useState({ width: 9, height: 19.5 });

  useEffect(() => {
    const url = configUrlForStream(streamUrl);
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((body: unknown) => {
        if (!body || typeof body !== "object") return;
        const width = numberField(body, "width");
        const height = numberField(body, "height");
        if (width && height) setRatio({ width, height });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [streamUrl]);

  useEffect(() => {
    if (!wsUrl) {
      setConnected(false);
      return;
    }
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.onopen = () => { if (!closed) setConnected(true); };
      socket.onerror = () => { if (!closed) setConnected(false); };
      socket.onclose = () => {
        socketRef.current = null;
        if (!closed) {
          setConnected(false);
          retry = setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [wsUrl]);

  function sendTouch(phase: 0 | 1 | 2, event: PointerEvent<HTMLDivElement>) {
    const hit = hitRef.current;
    if (!hit) return;
    const point = pointOnRect({ clientX: event.clientX, clientY: event.clientY, rect: hit.getBoundingClientRect() });
    if (!point) return;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(encodeTouch({ type: PHASE[phase], x: point.x, y: point.y }));
  }

  function sendHome() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encodeButton("home"));
      return;
    }
    onHome?.();
  }

  return (
    <div className="device-stage">
      <div className="device-fit">
        <div className="device-bezel" style={{ "--ar-w": String(ratio.width), "--ar-h": String(ratio.height) } as CSSProperties}>
          <div className="device-screen">
            <img className="device-stream" src={streamUrl} alt={`${name} live stream`} draggable={false} />
            <div
              ref={hitRef}
              className="device-hit"
              aria-label={`Interact with ${name}`}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.preventDefault();
                pointerRef.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                sendTouch(0, event);
              }}
              onPointerMove={(event) => {
                if (pointerRef.current !== event.pointerId) return;
                event.preventDefault();
                sendTouch(1, event);
              }}
              onPointerUp={(event) => {
                if (pointerRef.current !== event.pointerId) return;
                pointerRef.current = null;
                sendTouch(2, event);
              }}
              onPointerCancel={() => {
                pointerRef.current = null;
              }}
            />
          </div>
        </div>
      </div>
      <div className="device-controls">
        <button type="button" className="ghost" onClick={sendHome} disabled={!onHome && !connected}>Home</button>
        {wsUrl && !connected ? <span className="muted">Connecting…</span> : null}
      </div>
    </div>
  );
}

function numberField(value: object, key: string): number | undefined {
  if (!(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) && field > 0 ? field : undefined;
}
