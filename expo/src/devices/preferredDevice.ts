export type SimDevice = {
  udid: string;
  name: string;
  state: string;
  runtime?: string;
  streamUrl?: string;
  wsUrl?: string;
};

export function preferredDevice(devices: SimDevice[]) {
  return devices.find((device) => device.streamUrl) ?? devices.find((device) => device.state === 'booted') ?? devices[0];
}
