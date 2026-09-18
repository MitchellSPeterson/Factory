import { expect, mock, test } from "bun:test";

const reads: string[] = [];

mock.module("expo-file-system", () => {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      reads.push(this.uri);
      return new Uint8Array([9, 8, 7]);
    }
  }
  return { File };
});

const { pickedBytesToBody, readPickedAttachment } = await import("./pickedAttachment");

test("native reads picker bytes into an ArrayBuffer without Blob wrapping", async () => {
  reads.length = 0;
  const uri = "content://media/picker/photo.jpg";
  const body = await readPickedAttachment(uri, "android");
  expect(reads).toEqual([uri]);
  if (!(body instanceof ArrayBuffer)) throw new Error("native attach should return ArrayBuffer");
  expect(new Uint8Array(body)).toEqual(new Uint8Array([9, 8, 7]));
});

test("pickedBytesToBody copies into a standalone buffer", () => {
  const shared = new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 4);
  const body = pickedBytesToBody(shared);
  expect(new Uint8Array(body)).toEqual(new Uint8Array([2, 3, 4]));
  shared[0] = 9;
  expect(new Uint8Array(body)).toEqual(new Uint8Array([2, 3, 4]));
});

test("web reads the picked file with fetch", async () => {
  reads.length = 0;
  const result = await readPickedAttachment("data:text/plain,hello", "web");
  expect(reads).toEqual([]);
  if (!(result instanceof Blob)) throw new Error("web attach should return a Blob");
  expect(await result.text()).toBe("hello");
});
