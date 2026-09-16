const STORAGE_KEY = 'factory-project-scope';

export function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeStored(value: string) {
  try {
    if (value === '') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}
