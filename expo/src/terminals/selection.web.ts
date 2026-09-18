export function readSelection(projectId: string) {
  try {
    return localStorage.getItem(`factory-terminal:${projectId}`);
  } catch {
    return null;
  }
}
export function writeSelection(projectId: string, id: string) {
  try {
    localStorage.setItem(`factory-terminal:${projectId}`, id);
  } catch {
    return;
  }
}
