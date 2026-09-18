import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cursorImagesFromPaths, cursorUserMessage } from "./cursorMessage";

test("Cursor text-only sends stay a string", () => {
  expect(cursorUserMessage("What does auth do?")).toBe("What does auth do?");
  expect(cursorUserMessage("What does auth do?", [])).toBe("What does auth do?");
});

test("Cursor image-only sends a placeholder and inline image data", () => {
  const image = { data: "abc", mimeType: "image/png" };
  expect(cursorUserMessage("", [image])).toEqual({
    text: "See the attached image.",
    images: [image],
  });
});

test("Cursor text plus images keeps the prompt", () => {
  const images = [
    { data: "aa", mimeType: "image/png" },
    { data: "bb", mimeType: "image/jpeg" },
  ];
  expect(cursorUserMessage("Look at this", images)).toEqual({
    text: "Look at this",
    images,
  });
});

test("cursorImagesFromPaths reads local files as base64", () => {
  const dir = path.join(os.tmpdir(), `factory-cursor-images-${Date.now()}`);
  mkdirSync(dir);
  const file = path.join(dir, "shot.jpg");
  writeFileSync(file, Buffer.from("hello"));
  expect(cursorImagesFromPaths([file])).toEqual([
    { data: Buffer.from("hello").toString("base64"), mimeType: "image/jpeg" },
  ]);
});
