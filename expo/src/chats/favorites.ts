import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { useCallback, useState } from "react";

const FILE_NAME = "factory-chat-favorites.json";
const STORAGE_KEY = "factory-chat-favorites";

export function favoriteId(provider: string, model: string) {
  return `${provider}:${model}`;
}

function parse(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function readFavorites(): string[] {
  try {
    if (Platform.OS === "web") {
      return parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "");
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return [];
    return parse(file.textSync());
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]) {
  try {
    if (Platform.OS === "web") {
      if (ids.length === 0) globalThis.localStorage?.removeItem(STORAGE_KEY);
      else globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (ids.length === 0) {
      if (file.exists) file.delete();
      return;
    }
    if (!file.exists) file.create();
    file.write(JSON.stringify(ids));
  } catch {
    return;
  }
}

export function useFavorites() {
  const [ids, setIds] = useState<string[]>(readFavorites);
  const toggle = useCallback((id: string) => {
    setIds((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      writeFavorites(next);
      return next;
    });
  }, []);
  return { ids, toggle };
}
