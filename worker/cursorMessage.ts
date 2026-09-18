import { readFileSync } from "node:fs";
import type { SDKUserMessage } from "@cursor/sdk";
import { mimeForImagePath } from "./grokAcp";

export type CursorImageData = { data: string; mimeType: string };

export function cursorImagesFromPaths(paths: readonly string[]): CursorImageData[] {
  return paths.map((file) => ({
    data: readFileSync(file).toString("base64"),
    mimeType: mimeForImagePath(file),
  }));
}

export function cursorUserMessage(
  prompt: string,
  images: readonly CursorImageData[] = [],
): string | SDKUserMessage {
  const text = prompt.trim() === "" && images.length > 0 ? "See the attached image." : prompt;
  if (images.length === 0) return text;
  return { text, images: [...images] };
}
