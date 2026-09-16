import { superviseDeviceHub } from './deviceHubService.cjs';

export async function startDeviceHub(): Promise<() => void> {
  return superviseDeviceHub();
}
