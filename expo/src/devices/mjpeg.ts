export function indexOfPair(buffer: Uint8Array, a: number, b: number, from = 0): number {
  for (let i = from; i < buffer.length - 1; i++) {
    if (buffer[i] === a && buffer[i + 1] === b) return i;
  }
  return -1;
}

export function pullJpegFrames(buffer: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = indexOfPair(buffer, 0xff, 0xd8, offset);
    if (start < 0) {
      return { frames, rest: buffer.slice(Math.max(offset, buffer.length - 1)) };
    }
    const end = indexOfPair(buffer, 0xff, 0xd9, start + 2);
    if (end < 0) return { frames, rest: buffer.slice(start) };
    frames.push(buffer.slice(start, end + 2));
    offset = end + 2;
  }
  return { frames, rest: new Uint8Array(0) };
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    const codes: number[] = [];
    for (let j = 0; j < slice.length; j++) codes.push(slice[j]!);
    parts.push(String.fromCharCode(...codes));
  }
  return btoa(parts.join(''));
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const next = new Uint8Array(left.length + right.length);
  next.set(left, 0);
  next.set(right, left.length);
  return next;
}

export async function readMjpegFrames(opts: {
  url: string;
  signal: AbortSignal;
  onFrame: (bytes: Uint8Array) => void;
}): Promise<void> {
  let rest: Uint8Array = new Uint8Array(0);
  const push = (chunk: Uint8Array) => {
    rest = concat(rest, chunk);
    if (rest.length > 2_000_000) rest = rest.subarray(rest.length - 1_000_000);
    const pulled = pullJpegFrames(rest);
    rest = pulled.rest;
    const latest = pulled.frames.at(-1);
    if (latest) opts.onFrame(latest);
  };

  if (typeof fetch === 'function') {
    const res = await fetch(opts.url, { signal: opts.signal, headers: { Accept: 'application/octet-stream' } });
    if (!res.ok) throw new Error(`Stream failed (${res.status}).`);
    const reader = res.body && 'getReader' in res.body ? res.body.getReader() : null;
    if (reader) {
      try {
        while (!opts.signal.aborted) {
          const { done, value } = await reader.read();
          if (done || opts.signal.aborted) break;
          if (value) push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      return;
    }
  }

  await readWithXhr(opts.url, opts.signal, push);
}

function readWithXhr(url: string, signal: AbortSignal, onChunk: (chunk: Uint8Array) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    if (typeof xhr.overrideMimeType === 'function') {
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
    }
    let seen = 0;
    const consume = () => {
      const text = xhr.responseText;
      if (text.length <= seen) return;
      const chunk = new Uint8Array(text.length - seen);
      for (let i = seen; i < text.length; i++) chunk[i - seen] = text.charCodeAt(i) & 0xff;
      seen = text.length;
      onChunk(chunk);
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      resolve();
    };
    xhr.onerror = () => reject(new Error('Stream failed.'));
    xhr.onabort = () => resolve();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort);
    xhr.send();
  });
}
