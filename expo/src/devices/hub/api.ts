import Constants from 'expo-constants';
import { lanHostFromManifest } from '../streamUrl';
import { items, record, text } from './protocol';

export type HubDevice = { id: string; name: string; platform: 'ios' | 'android'; version: string; booted: boolean; physical: boolean; supported: boolean };
function developmentOrigins(): string[] {
  const origins: string[] = [];
  for (const value of [text(record(Constants.expoGoConfig).debuggerHost), Constants.expoConfig?.hostUri, Constants.linkingUri]) {
    if (!value) continue;
    try {
      const normalized = value.replace(/^exp:/, 'http:').replace(/^exps:/, 'https:');
      const url = new URL(normalized.includes('://') ? normalized : `http://${normalized}`);
      if (url.protocol === 'http:' || url.protocol === 'https:') origins.push(url.origin);
    } catch {}
  }
  return [...new Set(origins)];
}

export async function connectDeviceHub(): Promise<{ baseUrl: string; devices: HubDevice[] }> {
  const origins = developmentOrigins();
  const advertised = await Promise.any(origins.map(async origin => {
    const response = await fetch(`${origin}/__factory/devices`, {
      method: 'POST', headers: { 'X-Factory-Device-Request': '1' }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Preparing Devices');
    const body = record(await response.json());
    return items(body.urls).filter((value): value is string => typeof value === 'string');
  })).catch(() => []);
  const urls = [...advertised];
  for (const origin of origins) {
    const url = new URL(origin);
    url.port = '3400';
    urls.push(url.origin);
  }
  const fallbackHost = lanHostFromManifest([process.env.EXPO_PUBLIC_DEVICE_HOST]);
  if (fallbackHost) urls.push(`http://${fallbackHost}:3400`);
  if (process.env.EXPO_PUBLIC_DEVICE_HUB_URL) urls.push(process.env.EXPO_PUBLIC_DEVICE_HUB_URL);
  const candidates = [...new Set(urls)].filter(value => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  });
  try {
    return await Promise.any(candidates.map(async baseUrl => {
      const data = await hubRequest(baseUrl.replace(/\/$/, ''), '/api/devices', undefined, AbortSignal.timeout(5000));
      if (!Array.isArray(data.simulators) || !Array.isArray(data.emulators)) throw new Error('Not a device service');
      return { baseUrl: baseUrl.replace(/\/$/, ''), devices: parseDevices(data) };
    }));
  } catch {
    throw new Error('Reconnecting to your machine. Keep it awake and connected to the same network.');
  }
}
export function parseDevices(body: unknown): HubDevice[] {
  const result: HubDevice[] = [];
  const data = record(body);
  for (const raw of [...items(data.simulators), ...items(data.emulators)]) {
    const device = record(raw);
    if (!text(device.id) || (device.platform !== 'ios' && device.platform !== 'android')) continue;
    result.push({ id: text(device.id), name: text(device.name), platform: device.platform,
      version: text(device.version), booted: device.booted === true,
      physical: device.physical === true, supported: device.supported !== false });
  }
  return result;
}
export async function hubRequest(base: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ?? AbortSignal.timeout(body === undefined ? 10000 : 200000),
  });
  const data = record(await response.json());
  if (!response.ok || data.ok === false) throw new Error(text(data.error, `Device Hub request failed (${response.status}).`));
  return data;
}
