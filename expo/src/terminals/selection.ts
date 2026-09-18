import { File, Paths } from "expo-file-system";
export function readSelection(projectId: string) {
  try {
    const file = new File(Paths.document, `factory-terminal-${projectId}.txt`);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}
export function writeSelection(projectId: string, id: string) {
  try {
    const file = new File(Paths.document, `factory-terminal-${projectId}.txt`);
    if (!file.exists) file.create();
    file.write(id);
  } catch {
    return;
  }
}
