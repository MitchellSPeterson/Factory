import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadsDir } from "./mailbox/store";

/** Artifacts are content-addressed copies, never mutable paths into agent output. */
export async function retainBuildArtifact(root: string, buildId: string, content: string | Uint8Array, extension: string) {
  if (!/^[\w-]+$/.test(buildId) || !/^[a-z0-9]+$/.test(extension)) throw new Error("Invalid artifact identity.");
  const bytes = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  if (bytes.length > 25 * 1024 * 1024) throw new Error("Artifact exceeds 25 MB.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const directory = path.join(uploadsDir(root), "build-artifacts", buildId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${digest}.${extension}`);
  try { await writeFile(file, bytes, { flag: "wx", mode: 0o400 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return { id: digest, path: file, sha256: digest, size: bytes.length };
}

/** Evidence must originate inside this execution; symlink escapes and missing files fail closed. */
export async function readEvidenceFile(directory: string, relative: string): Promise<Buffer> {
  if (!relative || path.isAbsolute(relative)) throw new Error("Evidence path must be relative.");
  const base = await realpath(directory);
  const file = await realpath(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep)) throw new Error("Evidence path escapes its execution.");
  const info = await stat(file);
  if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error("Invalid evidence file.");
  return readFile(file);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Validate complete PNG pixel data, or JPEG marker/frame/scan structure; magic headers alone are insufficient. */
export function validScreenshot(bytes: Uint8Array): boolean {
  const b = Buffer.from(bytes);
  try {
    if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      let offset = 8, width = 0, height = 0, depth = 0, channels = 0, ended = false;
      const data: Buffer[] = [];
      while (offset + 12 <= b.length) {
        const size = b.readUInt32BE(offset); const end = offset + 12 + size;
        if (end > b.length) return false;
        const kind = b.toString('ascii', offset + 4, offset + 8);
        if (crc32(b.subarray(offset + 4, end - 4)) !== b.readUInt32BE(end - 4)) return false;
        if (kind === 'IHDR') {
          if (offset !== 8 || size !== 13) return false;
          width = b.readUInt32BE(offset + 8); height = b.readUInt32BE(offset + 12); depth = b[offset + 16]!;
          channels = ({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[b[offset + 17]!] ?? 0;
          if (!width || !height || width * height > 25_000_000 || !channels || ![1,2,4,8,16].includes(depth) || b[offset + 18] !== 0 || b[offset + 19] !== 0 || b[offset + 20] !== 0) return false;
        } else if (kind === 'IDAT') data.push(b.subarray(offset + 8, end - 4));
        else if (kind === 'IEND') { if (size || end !== b.length) return false; ended = true; break; }
        offset = end;
      }
      if (!ended || !width || !data.length) return false;
      const rowSize = Math.ceil(width * channels * depth / 8) + 1;
      const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: 100_000_000 });
      if (pixels.length !== rowSize * height) return false;
      for (let row = 0; row < height; row++) if (pixels[row * rowSize]! > 4) return false;
      return true;
    }
    if (b.length < 20 || b[0] !== 255 || b[1] !== 216 || b.at(-2) !== 255 || b.at(-1) !== 217) return false;
    let offset = 2, frame = false, scan = false;
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 255) return false;
      while (b[offset] === 255) offset++;
      const marker = b[offset++]!;
      if (marker === 217) break;
      const size = b.readUInt16BE(offset); if (size < 2 || offset + size > b.length) return false;
      if ([192,193,194].includes(marker)) { if (size < 8 || !b.readUInt16BE(offset + 3) || !b.readUInt16BE(offset + 5)) return false; frame = true; }
      if (marker === 218) { scan = size >= 6 && offset + size < b.length - 2; break; }
      offset += size;
    }
    return frame && scan;
  } catch { return false; }
}
