import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { PairingScreen } from "@/settings/pairing-screen";
import { pairLocalWorker, readWorkerPairing, writeWorkerPairing, type WorkerPairing } from "@/lib/pairing";
import type { ApiFn } from "../../../shared/mailboxApi";

type FactoryClient = WorkerPairing;

const FactoryContext = createContext<FactoryClient | null>(null);
const SetPairingContext = createContext<(next: WorkerPairing) => void>(() => {});

/** The Mac this app talks to, and a way to switch to another one. */
export function useConnection() {
  return { pairing: useContext(FactoryContext), setPairing: useContext(SetPairingContext) };
}

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

const polls = new Map<string, { timer: ReturnType<typeof setInterval>; listeners: Set<() => void> }>();

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
  // No EventSource (React Native): one shared poll per Worker instead of one per query.
  const url = `poll:${client.url}`;
  let poll = polls.get(url);
  if (!poll) {
    const listeners = new Set<() => void>();
    const timer = setInterval(() => {
      for (const listener of listeners) listener();
    }, 1000);
    poll = { timer, listeners };
    polls.set(url, poll);
  }
  const shared = poll;
  shared.listeners.add(onTick);
  return () => {
    shared.listeners.delete(onTick);
    if (shared.listeners.size === 0) {
      clearInterval(shared.timer);
      polls.delete(url);
    }
  };
}

function LookingForWorker({ detail }: { detail: string }) {
  return (
    <View className="flex-1 justify-center bg-surface p-6">
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
  return (
    <SetPairingContext.Provider value={setPairing}>
      <FactoryContext.Provider value={pairing}>{children}</FactoryContext.Provider>
    </SetPairingContext.Provider>
  );
}

export function useQuery<R, A extends object = object>(path: ApiFn<A, R>, args?: A | "skip"): R | undefined {
  const client = useContext(FactoryContext);
  const [data, setData] = useState<R | undefined>(undefined);
  const key = args === "skip" ? "skip" : JSON.stringify(args ?? {});
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    last.current = undefined;
    setData(undefined);
    if (!client || args === "skip") return;
    let cancelled = false;
    let running = false;
    let dirty = false;
    let seq = 0;
    const load = () => {
      // A tick during an in-flight request queues one re-run instead of stacking requests.
      if (running) {
        dirty = true;
        return;
      }
      running = true;
      const mine = ++seq;
      rpc(client, "query", path, args ?? {})
        .then((value) => {
          if (cancelled || mine !== seq) return;
          const next = JSON.stringify(value) ?? "";
          if (next === last.current) return;
          last.current = next;
          setData(value as R);
        })
        .catch(() => {}) // keep the last good value
        .finally(() => {
          running = false;
          if (dirty && !cancelled) {
            dirty = false;
            load();
          }
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
