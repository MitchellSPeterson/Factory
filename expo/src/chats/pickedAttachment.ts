import { File } from "expo-file-system";

export function pickedBytesToBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function readPickedAttachment(uri: string, os: string): Promise<Blob | ArrayBuffer> {
  if (os === "web") return (await fetch(uri)).blob();
  // ponytail: RN Blob([Uint8Array]) throws; fetch() cannot open content://. Read bytes and
  // copy into a fresh ArrayBuffer for the upload body.
  return pickedBytesToBody(await new File(uri).bytes());
}
