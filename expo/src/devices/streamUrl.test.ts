import { expect, test } from 'bun:test';

import { lanHostFromManifest, rewriteLoopbackUrl } from './streamUrl';

test('lanHostFromManifest picks an IPv4 from Expo hostUri', () => {
  expect(lanHostFromManifest(['192.168.1.12:8081'])).toBe('192.168.1.12');
  expect(lanHostFromManifest([undefined, 'exp://10.0.0.8:8081'])).toBe('10.0.0.8');
  expect(lanHostFromManifest(['localhost:8081'])).toBeNull();
  expect(lanHostFromManifest(['127.0.0.1:8081'])).toBeNull();
});

test('lanHostFromManifest respects host priority instead of preferring Tailscale', () => {
  expect(lanHostFromManifest(['192.168.1.39:8081', '100.89.56.56'])).toBe('192.168.1.39');
  expect(lanHostFromManifest(['100.89.56.56', '192.168.1.39:8081'])).toBe('100.89.56.56');
});

test('rewriteLoopbackUrl points loopback streams at the Expo machine', () => {
  expect(rewriteLoopbackUrl('http://127.0.0.1:3100/helper/AAA/stream.mjpeg', '192.168.1.12')).toBe(
    'http://192.168.1.12:3100/helper/AAA/stream.mjpeg',
  );
  expect(rewriteLoopbackUrl('http://127.0.0.1:3200/helper/AAA/stream.mjpeg', '100.89.56.56')).toBe(
    'http://100.89.56.56:3200/helper/AAA/stream.mjpeg',
  );
  expect(rewriteLoopbackUrl('ws://localhost:3100/ws', '10.0.0.8')).toBe('ws://10.0.0.8:3100/ws');
  expect(rewriteLoopbackUrl('http://127.0.0.1:3100/stream.mjpeg', null)).toBe('http://127.0.0.1:3100/stream.mjpeg');
});
