import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { parseAppearance, type AppearancePreference } from './appearance';

const FILE_NAME = 'factory-appearance.txt';
const STORAGE_KEY = 'factory-appearance';

let memory: AppearancePreference | null = null;

export function readAppearance(): AppearancePreference {
  if (memory) return memory;
  try {
    let raw = '';
    if (Platform.OS === 'web') {
      raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? '';
    } else {
      const file = new File(Paths.document, FILE_NAME);
      raw = file.exists ? file.textSync() : '';
    }
    memory = parseAppearance(raw);
    return memory;
  } catch {
    memory = 'system';
    return memory;
  }
}

export function writeAppearance(preference: AppearancePreference) {
  memory = preference;
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, preference);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(preference);
  } catch {
    return;
  }
}
