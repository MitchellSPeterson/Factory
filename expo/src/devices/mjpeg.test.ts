import { expect, spyOn, test } from 'bun:test';

import { readMjpegFrames } from './mjpeg';

test('fragmented frames are consumed without accumulating playback delay', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, ...new Uint8Array(64), 0xff, 0xd9]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < jpeg.length; i += 4) controller.enqueue(jpeg.slice(i, i + 4));
      controller.close();
    },
  });
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
  const frames: Uint8Array[] = [];
  try {
    const start = performance.now();
    await readMjpegFrames({
      url: 'http://localhost/stream',
      signal: new AbortController().signal,
      onFrame: (frame) => frames.push(frame),
    });
    expect(frames).toEqual([jpeg]);
    expect(performance.now() - start).toBeLessThan(200);
  } finally {
    request.mockRestore();
  }
});

test('a burst presents only its newest complete frame', async () => {
  const first = new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]);
  const latest = new Uint8Array([0xff, 0xd8, 2, 0xff, 0xd9]);
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(new Uint8Array([...first, ...latest])),
  );
  const frames: Uint8Array[] = [];
  try {
    await readMjpegFrames({
      url: 'http://localhost/stream',
      signal: new AbortController().signal,
      onFrame: (frame) => frames.push(frame),
    });
    expect(frames).toEqual([latest]);
  } finally {
    request.mockRestore();
  }
});

test('stopping playback cancels the reader and discards queued frames', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]);
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(jpeg);
      stream.enqueue(jpeg);
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
  let frames = 0;
  try {
    await readMjpegFrames({
      url: 'http://localhost/stream',
      signal: controller.signal,
      onFrame: () => {
        frames += 1;
        controller.abort();
      },
    });
    expect(frames).toBe(1);
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  } finally {
    request.mockRestore();
  }
});
