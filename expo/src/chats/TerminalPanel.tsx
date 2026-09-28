import { useMutation } from "@/lib/factory";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { WebView } from "react-native-webview";

import { Alert } from "panelui-native/components/alert";
import { Button } from "panelui-native/components/button";

import type { Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { lanHostFromManifest, rewriteLoopbackUrl } from "@/devices/streamUrl";
import renderer from "./terminal.generated.json";
import {
  type HostPlatform,
  type PendingModifier,
  hostPlatformFromOs,
  resolveModifiedTerminalInput,
} from "./terminalInput";
import { createPtyDisplayGate } from "./ptyOutput";
import { createTerminalPasteSession } from "./terminalPaste";

type ToolbarAction =
  | { kind: "send"; key: string; label: string; data: string }
  | { kind: "clear"; key: string; label: string }
  | { kind: "paste"; key: string; label: string }
  | { kind: "modifier"; key: string; label: string; modifier: PendingModifier };

function terminalLanHost(): string | null {
  if (process.env.EXPO_OS === "web") return null;
  return lanHostFromManifest([
    process.env.EXPO_PUBLIC_DEVICE_HOST,
    stringField(Constants.expoGoConfig, "debuggerHost"),
    Constants.expoConfig?.hostUri,
    Constants.linkingUri,
  ]);
}

function stringField(value: object | null | undefined, key: string): string | undefined {
  if (!value || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function parseServer(raw: string): {
  type: string;
  data?: string;
  message?: string;
} | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const type = (value as { type?: unknown }).type;
    if (typeof type !== "string") return null;
    return value as { type: string; data?: string; message?: string };
  } catch {
    return null;
  }
}

function usePtySession(opts: { projectId: Id<"projects">; enabled: boolean }) {
  const issueTicket = useMutation(api.pty.issueTicket);
  const socketRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef({ cols: 80, rows: 24 });
  const [error, setError] = useState("");
  const [hostPlatform, setHostPlatform] = useState<HostPlatform>("mac");
  const listeners = useRef(new Set<(kind: "write" | "clear", data: string) => void>());

  const send = useCallback((frame: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }, []);

  const write = useCallback(
    (data: string) => {
      send({ type: "write", data });
      return true;
    },
    [send],
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      sizeRef.current = { cols, rows };
      send({ type: "resize", cols, rows });
    },
    [send],
  );

  const clear = useCallback(() => send({ type: "clear" }), [send]);

  const subscribe = useCallback(
    (listener: (kind: "write" | "clear", data: string) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  useEffect(() => {
    if (!opts.enabled) return;
    let closed = false;
    let socket: WebSocket | null = null;
    setError("");
    void (async () => {
      try {
        const ticket = await issueTicket({ projectId: opts.projectId });
        if (closed) return;
        const mapped = hostPlatformFromOs(ticket.hostOs ?? null);
        if (mapped) setHostPlatform(mapped);
        const url = `${rewriteLoopbackUrl(ticket.wsUrl, terminalLanHost())}?ticket=${encodeURIComponent(ticket.ticket)}`;
        socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => {
          send({
            type: "attach",
            cols: sizeRef.current.cols,
            rows: sizeRef.current.rows,
          });
        };
        socket.onmessage = (event) => {
          const frame = parseServer(String(event.data));
          if (!frame) return;
          if (frame.type === "data" || frame.type === "replay") {
            if (typeof frame.data === "string") {
              for (const listener of listeners.current) listener("write", frame.data);
            }
          } else if (frame.type === "clear") {
            for (const listener of listeners.current) listener("clear", "");
          } else if (frame.type === "error" && typeof frame.message === "string") {
            setError(frame.message);
          }
        };
        socket.onerror = () => {
          if (!closed) setError("Could not connect to the terminal.");
        };
        socket.onclose = () => {
          if (!closed) setError((current) => current || "Terminal disconnected.");
        };
      } catch (cause) {
        if (!closed)
          setError(cause instanceof Error ? cause.message : "Could not open the terminal.");
      }
    })();
    return () => {
      closed = true;
      socket?.close();
      socketRef.current = null;
    };
  }, [opts.enabled, opts.projectId, issueTicket, send]);

  return { error, write, resize, clear, subscribe, hostPlatform };
}

function toolbarActions(hostPlatform: HostPlatform): ToolbarAction[] {
  const modifiers: ToolbarAction[] =
    hostPlatform === "mac"
      ? [
          { kind: "modifier", key: "cmd", label: "cmd", modifier: "meta" },
          { kind: "modifier", key: "ctrl", label: "ctrl", modifier: "ctrl" },
        ]
      : [
          { kind: "modifier", key: "ctrl", label: "ctrl", modifier: "ctrl" },
          { kind: "modifier", key: "alt", label: "alt", modifier: "meta" },
        ];
  return [
    { kind: "send", key: "esc", label: "esc", data: "\u001b" },
    ...modifiers,
    { kind: "send", key: "tab", label: "tab", data: "\t" },
    { kind: "paste", key: "paste", label: "paste" },
    { kind: "clear", key: "clear", label: "clear" },
    { kind: "send", key: "up", label: "↑", data: "\u001b[A" },
    { kind: "send", key: "down", label: "↓", data: "\u001b[B" },
    { kind: "send", key: "left", label: "←", data: "\u001b[D" },
    { kind: "send", key: "right", label: "→", data: "\u001b[C" },
    { kind: "send", key: "tilde", label: "~", data: "~" },
    { kind: "send", key: "pipe", label: "|", data: "|" },
    { kind: "send", key: "slash", label: "/", data: "/" },
    { kind: "send", key: "dash", label: "-", data: "-" },
  ];
}

export function TerminalPanel({
  projectId,
  projectName,
  visible,
}: {
  projectId: Id<"projects">;
  projectName: string;
  visible: boolean;
}) {
  const keyboard = useKeyboardHeight();
  const web = useRef<WebView>(null);
  const paste = useRef(createTerminalPasteSession());
  const gate = useRef(createPtyDisplayGate());
  const [modifier, setModifier] = useState<PendingModifier | null>(null);
  const session = usePtySession({ projectId, enabled: visible });
  const hostPlatform = session.hostPlatform;
  const actions = useMemo(() => toolbarActions(hostPlatform), [hostPlatform]);

  const deliver = useCallback((event: { kind: "write" | "clear"; data?: string }) => {
    if (event.kind === "clear") web.current?.postMessage(JSON.stringify({ type: "clear" }));
    else web.current?.postMessage(JSON.stringify({ type: "write", data: event.data }));
  }, []);

  useEffect(() => {
    paste.current.reset(visible);
    if (!visible) gate.current.dropPending();
  }, [visible]);

  useEffect(() => {
    return session.subscribe((kind, data) => {
      gate.current.push(kind === "clear" ? { kind: "clear" } : { kind: "write", data }, deliver);
    });
  }, [session.subscribe, deliver]);

  function markRendererReady() {
    gate.current.markReady(deliver);
    web.current?.postMessage(JSON.stringify({ type: "fit" }));
  }

  const writeChunk = useCallback(
    async (data: string) => session.write(data),
    [session.write],
  );

  function pasteClipboard() {
    void paste.current.paste({
      readText: () => Clipboard.getStringAsync(),
      write: writeChunk,
      onReadError: () => undefined,
    });
  }

  function onAction(action: ToolbarAction) {
    if (action.kind === "modifier") {
      setModifier((current) => (current === action.modifier ? null : action.modifier));
      return;
    }
    if (action.kind === "paste") {
      pasteClipboard();
      return;
    }
    if (action.kind === "clear") {
      session.clear();
      return;
    }
    if (modifier) {
      const resolved = resolveModifiedTerminalInput({
        data: action.data,
        modifier,
        hostPlatform,
      });
      setModifier(null);
      if (resolved.kind === "paste") pasteClipboard();
      else void session.write(resolved.data);
      return;
    }
    void session.write(action.data);
  }

  return (
    <View className="min-h-0 flex-1 bg-background" style={{ paddingBottom: keyboard }}>
      {session.error ? (
        <Alert variant="destructive" className="mx-3 mt-2">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{session.error}</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : null}
      <WebView
        ref={web}
        accessibilityLabel={projectName ? `Terminal for ${projectName}` : "Terminal"}
        source={{ html: renderer }}
        style={{ flex: 1 }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        automaticallyAdjustContentInsets={false}
        setSupportMultipleWindows={false}
        onLoadEnd={() => {
          markRendererReady();
        }}
        onMessage={(event) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.nativeEvent.data);
          } catch {
            return;
          }
          if (!parsed || typeof parsed !== "object") return;
          const message = parsed as {
            type?: string;
            data?: string;
            cols?: number;
            rows?: number;
          };
          if (message.type === "input" && typeof message.data === "string") {
            if (modifier) {
              const resolved = resolveModifiedTerminalInput({
                data: message.data,
                modifier,
                hostPlatform,
              });
              setModifier(null);
              if (resolved.kind === "paste") pasteClipboard();
              else void session.write(resolved.data);
            } else {
              void session.write(message.data);
            }
          } else if (
            message.type === "resize" &&
            Number.isInteger(message.cols) &&
            Number.isInteger(message.rows)
          ) {
            session.resize(message.cols!, message.rows!);
          } else if (message.type === "ready") {
            markRendererReady();
            if (Number.isInteger(message.cols) && Number.isInteger(message.rows)) {
              session.resize(message.cols!, message.rows!);
            }
          }
        }}
      />
      <View className="min-h-[52px] border-t border-border bg-surface">
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-1.5 px-2 py-2"
        >
          {actions.map((action) => {
            const active = action.kind === "modifier" && modifier === action.modifier;
            const strong = action.kind === "modifier" || action.kind === "clear";
            return (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                accessibilityLabel={action.label}
                onPress={() => onAction(action)}
                pressScale={1}
                pressOpacity={0.72}
                className={`h-9 rounded-full px-3 ${active ? "border-primary bg-primary/15" : ""}`}
                labelClassName={strong ? "text-[13px] font-semibold uppercase" : "text-[13px] font-medium"}
              >
                {action.label}
              </Button>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
