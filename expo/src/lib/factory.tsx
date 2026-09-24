import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { PairingScreen } from "@/settings/pairing-screen";
import { pairLocalWorker, readWorkerPairing, writeWorkerPairing, type WorkerPairing } from "@/lib/pairing";
import type { ApiFn } from "../../../shared/mailboxApi";

type FactoryClient = WorkerPairing;

const FactoryContext = createContext<FactoryClient | null>(null);

async function rpc(client: FactoryClient, kind: "query" | "mutation" | "action", path: string, args: object) {
  const response = await fetch(`${client.url}/api/${kind}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${client.token}`,
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!json || typeof json !== "object") throw new Error("Could not reach the Worker.");
  const body = json as { status?: string; value?: unknown; errorMessage?: string };
  if (body.status === "error") throw new Error(body.errorMessage ?? "Worker error");
  return body.value;
}

// One EventSource per Worker, shared by every query. Browsers allow ~6 HTTP/1.1
// connections per host; a stream per query used them all and stalled mutations.
const streams = new Map<string, { source: EventSource; listeners: Set<() => void> }>();

function subscribe(client: FactoryClient, onTick: () => void) {
  if (typeof EventSource !== "undefined") {
    const url = `${client.url}/events?token=${encodeURIComponent(client.token)}`;
    let stream = streams.get(url);
    if (!stream) {
      const listeners = new Set<() => void>();
      const source = new EventSource(url);
      source.onmessage = () => {
        for (const listener of listeners) listener();
      };
      stream = { source, listeners };
      streams.set(url, stream);
    }
    const shared = stream;
    shared.listeners.add(onTick);
    return () => {
      shared.listeners.delete(onTick);
      if (shared.listeners.size === 0) {
        shared.source.close();
        streams.delete(url);
      }
    };
  }
  const timer = setInterval(onTick, 500);
  return () => clearInterval(timer);
}

function LookingForWorker({ detail }: { detail: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.sidebar }}>
      <ThemedText type="heading" style={{ fontSize: 28 }}>
        Looking for Factory on this Mac
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={{ fontSize: 16, lineHeight: 22, marginTop: 8 }}>
        {detail}
      </ThemedText>
    </View>
  );
}

export function FactoryProvider({ children }: { children: ReactNode }) {
  const [pairing, setPairing] = useState(() => (Platform.OS === "web" ? null : readWorkerPairing()));
  const [detail, setDetail] = useState("Start the Worker if it is not already running.");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      try {
        const next = await pairLocalWorker();
        if (!cancelled) setPairing(next);
      } catch (error) {
        if (!cancelled) {
          setDetail(error instanceof Error ? error.message : "Start the Worker on this Mac.");
          timer = setTimeout(() => void look(), 750);
        }
      }
    };
    void look();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!pairing) {
    if (Platform.OS === "web") return <LookingForWorker detail={detail} />;
    return (
      <PairingScreen
        onReady={(next) => {
          writeWorkerPairing(next);
          setPairing(next);
        }}
      />
    );
  }
  return <FactoryContext.Provider value={pairing}>{children}</FactoryContext.Provider>;
}

export function useQuery<R, A extends object = object>(path: ApiFn<A, R>, args?: A | "skip"): R | undefined {
  const client = useContext(FactoryContext);
  const [data, setData] = useState<R | undefined>(undefined);
  const key = args === "skip" ? "skip" : JSON.stringify(args ?? {});
  useEffect(() => {
    if (!client || args === "skip") {
      setData(undefined);
      return;
    }
    let cancelled = false;
    const load = () => {
      void rpc(client, "query", path, args ?? {})
        .then((value) => {
          if (!cancelled) setData(value as R);
        })
        .catch(() => {
          if (!cancelled) setData(undefined);
        });
    };
    load();
    const stop = subscribe(client, load);
    return () => {
      cancelled = true;
      stop();
    };
  }, [client, path, key]);
  return data;
}

export function useMutation<A extends object, R>(path: ApiFn<A, R>) {
  const client = useContext(FactoryContext);
  return useCallback(
    async (args?: A) => {
      if (!client) throw new Error("Pair this device first.");
      return (await rpc(client, "mutation", path, args ?? {})) as R;
    },
    [client, path],
  );
}

export function useAction<A extends object, R>(path: ApiFn<A, R>) {
  const client = useContext(FactoryContext);
  return useCallback(
    async (args?: A) => {
      if (!client) throw new Error("Pair this device first.");
      return (await rpc(client, "action", path, args ?? {})) as R;
    },
    [client, path],
  );
}

export function useFactoryOrigin() {
  return useContext(FactoryContext)?.url ?? "";
}
