import { expect, test } from 'bun:test';

import { isTailscaleHost, lanHostFromManifest, rawStreamUrl, rewriteLoopbackUrl } from './streamUrl';
import { pullJpegFrames, uint8ToBase64 } from './mjpeg';

test('lanHostFromManifest picks an IPv4 from Expo hostUri', () => {
  expect(lanHostFromManifest(['192.168.1.12:8081'])).toBe('192.168.1.12');
  expect(lanHostFromManifest([undefined, 'exp://10.0.0.8:8081'])).toBe('10.0.0.8');
  expect(lanHostFromManifest(['localhost:8081'])).toBeNull();
  expect(lanHostFromManifest(['127.0.0.1:8081'])).toBeNull();
});

test('lanHostFromManifest prefers a Tailscale address', () => {
  expect(isTailscaleHost('100.89.56.56')).toBe(true);
  expect(isTailscaleHost('192.168.1.39')).toBe(false);
  expect(lanHostFromManifest(['192.168.1.39:8081', '100.89.56.56'])).toBe('100.89.56.56');
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

test('rawStreamUrl asks serve-sim for octet-stream frames', () => {
  expect(rawStreamUrl('http://10.0.0.8:3100/stream.mjpeg')).toBe('http://10.0.0.8:3100/stream.mjpeg?raw=1');
  expect(rawStreamUrl('http://10.0.0.8:3100/stream.mjpeg?raw=1')).toBe('http://10.0.0.8:3100/stream.mjpeg?raw=1');
});

test('pullJpegFrames splits concatenated JPEGs', () => {
  const a = new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]);
  const b = new Uint8Array([0xff, 0xd8, 2, 0xff, 0xd9]);
  const joined = new Uint8Array([...a, 0x00, ...b, 0xff]);
  const { frames, rest } = pullJpegFrames(joined);
  expect(frames).toHaveLength(2);
  expect([...frames[0]!]).toEqual([...a]);
  expect([...frames[1]!]).toEqual([...b]);
  expect([...rest]).toEqual([0xff]);
});

test('pullJpegFrames skips multipart headers from serve-sim raw streams', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 9, 0xff, 0xd9]);
  const header = new TextEncoder().encode('--frame\r\nContent-Type: image/jpeg\r\n\r\n');
  const joined = new Uint8Array(header.length + jpeg.length);
  joined.set(header);
  joined.set(jpeg, header.length);
  const { frames } = pullJpegFrames(joined);
  expect(frames).toHaveLength(1);
  expect([...frames[0]!]).toEqual([...jpeg]);
});

test('uint8ToBase64 encodes JPEG bytes', () => {
  expect(uint8ToBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe('/9j/2Q==');
});
