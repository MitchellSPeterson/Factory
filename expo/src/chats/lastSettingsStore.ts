import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import {
  DEFAULT_CHAT_SETTINGS,
  parseLastSettings,
  type ChatSettings,
} from "./lastSettings";

const FILE_NAME = "factory-chat-last-settings.json";
const STORAGE_KEY = "factory-chat-last-settings";

let memory: ChatSettings | null = null;

export function readLastSettings(): ChatSettings {
  if (memory) return memory;
  try {
    let raw = "";
    if (Platform.OS === "web") {
      raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? "";
    } else {
      const file = new File(Paths.document, FILE_NAME);
      raw = file.exists ? file.textSync() : "";
    }
    memory = parseLastSettings(raw);
    return memory;
  } catch {
    memory = DEFAULT_CHAT_SETTINGS;
    return memory;
  }
}

export function writeLastSettings(settings: ChatSettings) {
  memory = settings;
  const raw = JSON.stringify(settings);
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(STORAGE_KEY, raw);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(raw);
  } catch {
    return;
  }
}
