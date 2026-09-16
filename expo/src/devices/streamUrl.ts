export function isTailscaleHost(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 100 && b >= 64 && b <= 127;
}

export function lanHostFromManifest(values: Array<string | undefined | null>): string | null {
  const hosts: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const match = String(value).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (match && match[1] !== '127.0.0.1' && match[1] !== '0.0.0.0') hosts.push(match[1]);
  }
  return hosts[0] ?? null;
}

export function rewriteLoopbackUrl(url: string, lanHost: string | null): string {
  if (!lanHost) return url;
  return url.replace(
    /^(https?|wss?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/i,
    (_, proto: string) => `${proto}://${lanHost}`,
  );
}

export function rawStreamUrl(streamUrl: string): string {
  if (/[?&]raw=1(?:&|$)/.test(streamUrl)) return streamUrl;
  return streamUrl.includes('?') ? `${streamUrl}&raw=1` : `${streamUrl}?raw=1`;
}
