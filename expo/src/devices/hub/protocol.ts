import type { DeviceClient } from '../../../vendor/expo-hub-client/src/types';

export type ClientCommand = {
  [K in keyof DeviceClient]: DeviceClient[K] extends (...args: infer A) => unknown
    ? { method: K; args: A }
    : never;
}[keyof DeviceClient];
export type StreamSelection = { platform: 'ios' | 'android'; device: string; streamMode: 'webrtc' | 'h264' | 'mjpeg' };
export type HubMessage =
  | { type: 'select'; target: StreamSelection | null }
  | { type: 'command'; command: ClientCommand }
  | { type: 'camera'; facing: 'front' | 'back'; data: string };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}
export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
export function numeric(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function items(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function parseMessage(raw: string): Record<string, unknown> {
  try { return record(JSON.parse(raw)); } catch { return {}; }
}
