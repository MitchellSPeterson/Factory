export function ensureDeviceHub(): Promise<void>;
export function superviseDeviceHub(): () => void;
export function deviceHubAddresses(requestHost?: string): string[];
