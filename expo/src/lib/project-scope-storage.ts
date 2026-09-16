import { File, Paths } from 'expo-file-system';

const FILE_NAME = 'factory-project-scope.txt';

export function readStored(): string {
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) return '';
    return file.textSync();
  } catch {
    return '';
  }
}

export function writeStored(value: string) {
  try {
    const file = new File(Paths.document, FILE_NAME);
    if (value === '') {
      if (file.exists) file.delete();
      return;
    }
    if (!file.exists) file.create();
    file.write(value);
  } catch {
    return;
  }
}
