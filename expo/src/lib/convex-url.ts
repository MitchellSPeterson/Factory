import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";

import { pairingBase } from "./pairingBase";

export { pairingBase };

const FILE_NAME = "factory-convex-url.txt";
const STORAGE_KEY = "factory-convex-url";

let memory: string | null | undefined;

function envUrl() {
  const value = process.env.EXPO_PUBLIC_CONVEX_URL?.trim();
  return value ? value : null;
}

export function readConvexUrl(): string | null {
  if (memory !== undefined) return memory;
  const fromEnv = envUrl();
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
    memory = raw.trim() || null;
    return memory;
  } catch {
    memory = null;
    return null;
  }
}

export function writeConvexUrl(url: string) {
  const next = url.trim();
  memory = next || null;
  try {
    if (Platform.OS === "web") {
      if (!next) globalThis.localStorage?.removeItem(STORAGE_KEY);
      else globalThis.localStorage?.setItem(STORAGE_KEY, next);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(next);
  } catch {
    return;
  }
}

export async function pairFromWorker(input: string) {
  const base = pairingBase(input);
  const response = await fetch(`${base}/pair`, { signal: AbortSignal.timeout(8000) });
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || !("convexUrl" in body) || typeof body.convexUrl !== "string") {
    throw new Error("This address is not a Factory Worker.");
  }
  writeConvexUrl(body.convexUrl);
  return body.convexUrl;
}
