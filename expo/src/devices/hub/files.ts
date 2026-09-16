import { File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

export async function shareScreenshot(data: string) {
  if (!data.startsWith('data:image/png;base64,')) throw new Error('Screenshot was not a PNG image.');
  if (!(await isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  const file = new File(Paths.cache, `vasa-device-${Date.now()}.png`);
  const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), char => char.charCodeAt(0));
  file.write(bytes);
  try { await shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Device screenshot' }); }
  finally { file.delete(); }
}
export async function chooseCameraPng(): Promise<string | null> {
  const result = await getDocumentAsync({ type: 'image/png', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG smaller than 10 MB.');
    return `data:image/png;base64,${await file.base64()}`;
  } finally { file.delete(); }
}
