import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";

import { localWorkerBase, pairingBase, pairingFromLocalPair } from "./pairingBase";

export { localWorkerBase, pairingBase, pairingFromLocalPair };

const FILE_NAME = "factory-worker.json";
const STORAGE_KEY = "factory-worker";

export type WorkerPairing = { url: string; token: string };

let memory: WorkerPairing | null | undefined;

function envPairing(): WorkerPairing | null {
  const url = process.env.EXPO_PUBLIC_WORKER_URL?.trim();
  const token = process.env.EXPO_PUBLIC_WORKER_TOKEN?.trim();
  if (url && token) return { url: url.replace(/\/$/, ""), token };
  return null;
}

function parse(raw: string): WorkerPairing | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as { url?: unknown; token?: unknown };
    if (typeof record.url !== "string" || typeof record.token !== "string") return null;
    const url = record.url.trim().replace(/\/$/, "");
    const token = record.token.trim();
    if (!url || !token) return null;
    return { url, token };
  } catch {
    return null;
  }
}

export function readWorkerPairing(): WorkerPairing | null {
  if (memory !== undefined) return memory;
  const fromEnv = envPairing();
  if (fromEnv) {
    memory = fromEnv;
    return fromEnv;
  }
  try {
    let raw = "";
    if (Platform.OS === "web") {
      raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? "";
    } else {
      const file = new File(Paths.document, FILE_NAME);
      raw = file.exists ? file.textSync() : "";
    }
    memory = parse(raw);
    return memory;
  } catch {
    memory = null;
    return null;
  }
}

export function writeWorkerPairing(next: WorkerPairing | null) {
  memory = next ? { url: next.url.replace(/\/$/, ""), token: next.token } : null;
  const raw = memory ? JSON.stringify(memory) : "";
  try {
    if (Platform.OS === "web") {
      if (!raw) globalThis.localStorage?.removeItem(STORAGE_KEY);
      else globalThis.localStorage.setItem(STORAGE_KEY, raw);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(raw);
  } catch {
    return;
  }
}

export async function pairLocalWorker(): Promise<WorkerPairing> {
  const hostname = typeof location === "undefined" ? "127.0.0.1" : location.hostname;
  const base = localWorkerBase(hostname);
  const response = await fetch(`${base}/pair`, { signal: AbortSignal.timeout(2000) });
  const body: unknown = await response.json().catch(() => null);
  const pairing = pairingFromLocalPair(body, base);
  if (!pairing) {
    if (body && typeof body === "object") {
      throw new Error("Port 3402 is an old Worker. Stop that process, then run bun run dev again.");
    }
    throw new Error("Start the Worker on this Mac.");
  }
  writeWorkerPairing(pairing);
  return pairing;
}

export async function pairFromWorker(input: string): Promise<WorkerPairing> {
  const base = pairingBase(input);
  const response = await fetch(`${base}/pair`, { signal: AbortSignal.timeout(8000) });
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error("This address is not a Factory Worker.");
  const record = body as { workerUrl?: unknown; token?: unknown; tunnel?: unknown; tailscale?: unknown };
  const token = typeof record.token === "string" ? record.token : "";
  const preferred =
    (typeof record.tunnel === "string" && record.tunnel) ||
    (typeof record.tailscale === "string" && record.tailscale) ||
    (typeof record.workerUrl === "string" && record.workerUrl) ||
    base;
  if (!token) throw new Error("This address is not a Factory Worker.");
  const pairing = { url: preferred.replace(/\/$/, ""), token };
  writeWorkerPairing(pairing);
  return pairing;
}
